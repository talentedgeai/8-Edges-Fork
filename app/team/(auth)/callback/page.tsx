// Next checks for this directive in the file under app/, not through the
// re-export, and refuses to build an error boundary without it. The body in the
// entity carries it too, because that is the module that actually uses hooks.
"use client";

export { default } from "@/entities/team/routes/(auth)/callback/page";
