import { useEffect, useRef } from "react";
import { Bold, Italic, List, Link2, Heading2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
}

export function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    onChange(ref.current?.innerHTML ?? "");
  };

  const insertOfferLink = () => {
    ref.current?.focus();
    document.execCommand("insertHTML", false, '<a href="{{offer_link}}">See the offer</a>');
    onChange(ref.current?.innerHTML ?? "");
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/40 px-2 py-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={() => exec("bold")}>
          <Bold className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => exec("italic")}>
          <Italic className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => exec("formatBlock", "<h2>")}>
          <Heading2 className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => exec("insertUnorderedList")}>
          <List className="size-4" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button type="button" variant="ghost" size="sm" onClick={insertOfferLink}>
          <Link2 className="size-4" />
          <span className="ml-1 text-xs">Insert offer link</span>
        </Button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => onChange(ref.current?.innerHTML ?? "")}
        className="prose-editor min-h-56 px-4 py-3 text-sm leading-relaxed outline-none"
        data-placeholder="Write your email…"
      />
    </div>
  );
}
