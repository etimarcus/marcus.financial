"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export type LoginState = { error?: string } | null;

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const password = formData.get("password");
  const expected = process.env.APP_PASSWORD;

  if (!expected) {
    return { error: "Server not configured: APP_PASSWORD missing." };
  }

  if (typeof password !== "string" || password !== expected) {
    return { error: "Incorrect password." };
  }

  const session = await getSession();
  session.isLoggedIn = true;
  await session.save();
  redirect("/");
}

export async function logout() {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}
