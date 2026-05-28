import { ClerkProvider, SignInButton, SignUpButton, Show } from "@clerk/nextjs";
import "./globals.css";

export const metadata = {
  title: "Diario de Trading",
  description: "Registro y analíticas de mis trades en futuros",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('tj_theme');
                  if (theme === 'dark') {
                    document.documentElement.classList.add('dark');
                  } else if (theme === 'light') {
                    document.documentElement.classList.add('light');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <ClerkProvider>
          <Show when="signed-out">
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100vh",
              background: "var(--color-background-secondary)",
              gap: 16,
              fontFamily: "var(--font-sans)",
            }}>
              <div style={{ fontSize: 40 }}>📈</div>
              <h2 style={{ fontSize: 24, fontWeight: 600, color: "var(--color-text-primary)" }}>Trading Journal</h2>
              <p style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 12 }}>
                Inicia sesión para registrar y analizar tus trades
              </p>
              <div style={{ display: "flex", gap: 12 }}>
                <SignInButton mode="modal">
                  <button style={{
                    padding: "8px 20px",
                    background: "#378ADD",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: "pointer",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  }}>Iniciar Sesión</button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button style={{
                    padding: "8px 20px",
                    background: "var(--color-background-primary)",
                    color: "var(--color-text-primary)",
                    border: "0.5px solid var(--color-border-secondary)",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: "pointer",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                  }}>Registrarse</button>
                </SignUpButton>
              </div>
            </div>
          </Show>
          <Show when="signed-in">
            <div id="root">{children}</div>
          </Show>
        </ClerkProvider>
      </body>
    </html>
  );
}
