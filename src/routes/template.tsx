import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/template")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
