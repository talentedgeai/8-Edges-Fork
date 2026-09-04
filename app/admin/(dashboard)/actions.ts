"use server";

import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";

// Sign the admin out and return them to the login page.
export async function signOut() {
  const supabase = createSessionClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
