import { Lightbulb } from "lucide-react";
import { Button } from "./ui/button";
import Link from "next/link";

export default function ReportIssueButton() {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href="https://github.com/JoeBuildsStuff/text-editor/issues" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-muted-foreground">
        <Lightbulb className="w-4 h-4 shrink-0" />
        <span className="hidden sm:block">Request Feature</span>
      </Link>
    </Button>
  );
}