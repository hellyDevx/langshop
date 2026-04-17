import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const jobIds = url.searchParams.getAll("jobId");

  if (jobIds.length === 0) {
    return new Response("Missing jobId", { status: 400 });
  }

  // Verify jobs belong to this shop
  const jobs = await prisma.translationJob.findMany({
    where: { id: { in: jobIds }, shop: session.shop },
    select: { id: true },
  });
  const validIds = new Set(jobs.map((j) => j.id));

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let iterations = 0;
      const maxIterations = 150; // 5 min at 2s intervals

      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      const poll = async () => {
        if (request.signal.aborted || iterations >= maxIterations) {
          controller.close();
          return;
        }
        iterations++;

        try {
          const currentJobs = await prisma.translationJob.findMany({
            where: { id: { in: [...validIds] } },
          });

          let allDone = true;
          for (const job of currentJobs) {
            const payload = {
              jobId: job.id,
              status: job.status,
              completedItems: job.completedItems,
              totalItems: job.totalItems,
              failedItems: job.failedItems,
              errorMessage: job.errorMessage,
            };

            if (job.status === "completed") {
              send("complete", payload);
              validIds.delete(job.id);
            } else if (job.status === "failed") {
              send("error_event", payload);
              validIds.delete(job.id);
            } else {
              send("progress", payload);
              allDone = false;
            }
          }

          if (allDone || validIds.size === 0) {
            controller.close();
            return;
          }

          setTimeout(poll, 2000);
        } catch {
          controller.close();
        }
      };

      poll();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
