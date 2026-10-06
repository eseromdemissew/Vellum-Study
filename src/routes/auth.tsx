import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).default("signin"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Redirecting — Vellum" }],
  }),
  component: AuthRedirectPage,
});

function AuthRedirectPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();

  useEffect(() => {
    if (mode === "signup") {
      navigate({ to: "/signup", replace: true });
    } else {
      navigate({ to: "/login", replace: true });
    }
  }, [mode, navigate]);

  return null;
}
