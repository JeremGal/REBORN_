import { ProjectProvider } from "@/components/project/ProjectProvider";
import { ProjectShell } from "@/components/project/ProjectShell";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ProjectProvider id={id}>
      <ProjectShell>{children}</ProjectShell>
    </ProjectProvider>
  );
}
