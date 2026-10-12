import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSession, SESSION_COOKIE } from "@/lib/auth";
import { CopilotProvider } from "@/components/copilot-provider";
import { SourceSheetProvider } from "@/components/source-sheet";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const person = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!person) redirect("/login");
  return (
    <CopilotProvider user={person}>
      <SourceSheetProvider>
        <AppShell aiEnabled={process.env.AI_ENABLED !== "false"}>{children}</AppShell>
      </SourceSheetProvider>
    </CopilotProvider>
  );
}
