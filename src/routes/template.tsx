import { createFileRoute } from "@tanstack/react-router";
import { PulseTasks } from "./index";

export const Route = createFileRoute("/template")({ component: PulseTasks });
