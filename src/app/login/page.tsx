"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"idle" | "enviando" | "enviado" | "error">("idle");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setEstado(error ? "error" : "enviado");
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="mb-4 text-2xl font-bold">Entrar</h1>
      {estado === "enviado" ? (
        <p>Te mandamos un link a <b>{email}</b>. Abrilo desde este dispositivo.</p>
      ) : (
        <form onSubmit={enviar} className="flex flex-col gap-3">
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com" className="rounded border p-2"
          />
          <button disabled={estado === "enviando"} className="rounded bg-emerald-600 p-2 font-semibold text-white">
            {estado === "enviando" ? "Enviando..." : "Mandarme el link"}
          </button>
          {estado === "error" && <p className="text-red-600">No se pudo enviar. Probá de nuevo.</p>}
        </form>
      )}
    </main>
  );
}
