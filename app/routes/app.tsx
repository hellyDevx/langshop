import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
import { countUndismissed } from "../services/alerts.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const alertCount = await countUndismissed(session.shop);
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    alertCount,
  };
};

export default function App() {
  const { apiKey, alertCount } = useLoaderData<typeof loader>();
  const alertsLabel = alertCount > 0 ? `Alerts (${alertCount})` : "Alerts";

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Dashboard
        </Link>
        <Link to="/app/resources/products">Resources</Link>
        <Link to="/app/markets">Markets</Link>
        <Link to="/app/auto-translate">Auto-Translate</Link>
        <Link to="/app/images">Images</Link>
        <Link to="/app/glossary">Glossary</Link>
        <Link to="/app/analytics">Analytics</Link>
        <Link to="/app/alerts">{alertsLabel}</Link>
        <Link to="/app/settings">Settings</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
