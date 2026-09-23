import { LibraryWorkspace } from "@/domain/library/components/workspace/LibraryWorkspace";

/**
 * Render the shared library workspace for every library route.
 *
 * @returns {JSX.Element} Workspace home view.
 */
export default function Home() {
  return <LibraryWorkspace />;
}
