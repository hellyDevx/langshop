import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  isRouteErrorResponse,
} from "@remix-run/react";
import { Page, Card, Text, BlockStack } from "@shopify/polaris";

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <Page title={`${error.status} ${error.statusText}`}>
        <Card>
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd">
              {error.data || "An unexpected error occurred."}
            </Text>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  return (
    <Page title="Something went wrong">
      <Card>
        <BlockStack gap="200">
          <Text as="p" variant="bodyMd">
            An unexpected error occurred. Please try again later.
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );
}

export default function App() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
