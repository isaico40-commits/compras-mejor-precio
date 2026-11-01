"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inputCls, btnCls } from "@/components/ui";

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
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <p className="text-4xl">🛒</p>
      <h1 className="mb-1 mt-2 text-[28px] font-bold tracking-tight">Compras</h1>
      <p className="mb-6 text-suave">Tu lista y dónde conviene comprar cada cosa en Mar del Plata.</p>
      {estado === "enviado" ? (
        <p>Te mandamos un link a <b>{email}</b>. Abrilo desde este dispositivo.</p>
      ) : (
        <form onSubmit={enviar} className="flex flex-col gap-3">
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com" className={inputCls}
          />
          <button disabled={estado === "enviando"} className={btnCls}>
            {estado === "enviando" ? "Enviando..." : "Mandarme el link"}
          </button>
          {estado === "error" && <p className="text-red-600">No se pudo enviar. Probá de nuevo.</p>}
        </form>
      )}
    </main>
  );
}
