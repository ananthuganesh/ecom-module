"use client";

import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  RemoveFormatting,
  Underline as UnderlineIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function looksLikeHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ""));
}

function toEditorHtml(value) {
  const raw = String(value ?? "");
  if (!raw.trim()) return "";
  if (looksLikeHtml(raw)) return raw;
  return `<p>${raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>")}</p>`;
}

function ToolbarButton({ active, disabled, onClick, label, children }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={!!active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-[#303030] hover:bg-[#f1f1f1] disabled:opacity-40",
        active && "bg-[#e3e3e3]"
      )}
    >
      {children}
    </button>
  );
}

export default function ProductRichTextEditor({
  value = "",
  onChange,
  placeholder = "Describe this product",
}) {
  const [showHtml, setShowHtml] = useState(false);
  const [htmlDraft, setHtmlDraft] = useState("");
  const [block, setBlock] = useState("paragraph");

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({ placeholder }),
    ],
    [placeholder]
  );

  const editor = useEditor({
    extensions,
    content: toEditorHtml(value),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "admin-rte-content min-h-[9rem] px-3 py-2 text-[13px] leading-5 text-[#303030] outline-none focus:outline-none",
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.isEmpty ? "" : ed.getHTML();
      onChange?.(html);
    },
    onSelectionUpdate: ({ editor: ed }) => {
      if (ed.isActive("heading", { level: 1 })) setBlock("h1");
      else if (ed.isActive("heading", { level: 2 })) setBlock("h2");
      else if (ed.isActive("heading", { level: 3 })) setBlock("h3");
      else setBlock("paragraph");
    },
  });

  useEffect(() => {
    if (!editor) return;
    const next = toEditorHtml(value);
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (next === current) return;
    if (!value && editor.isEmpty) return;
    // Avoid clobbering while typing the same normalized content
    if (next.replace(/\s+/g, "") === current.replace(/\s+/g, "")) return;
    editor.commands.setContent(next || "", { emitUpdate: false });
  }, [value, editor]);

  useEffect(() => {
    if (showHtml && editor) {
      setHtmlDraft(editor.isEmpty ? "" : editor.getHTML());
    }
  }, [showHtml, editor]);

  if (!editor) {
    return (
      <div className="min-h-[11rem] rounded-lg border border-[#e3e3e3] bg-white" />
    );
  }

  const setBlockType = (next) => {
    setBlock(next);
    if (next === "paragraph") {
      editor.chain().focus().setParagraph().run();
      return;
    }
    const level = Number(next.replace("h", ""));
    editor.chain().focus().toggleHeading({ level }).run();
  };

  const applyLink = () => {
    const prev = editor.getAttributes("link").href || "";
    const url = window.prompt("Link URL", prev);
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url.trim() })
      .run();
  };

  const applyHtmlDraft = () => {
    editor.commands.setContent(htmlDraft || "", { emitUpdate: true });
    onChange?.(editor.isEmpty ? "" : editor.getHTML());
    setShowHtml(false);
  };

  return (
    <div className="admin-rte overflow-hidden rounded-lg border border-[#e3e3e3] bg-white">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[#e3e3e3] bg-[#fafafa] px-1.5 py-1">
        <div className="w-[7.5rem] shrink-0">
          <Select value={block} onValueChange={setBlockType}>
            <SelectTrigger className="h-7 w-full border-[#e3e3e3] bg-white shadow-none ring-0 focus-visible:border-[#b5b5b5] focus-visible:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="paragraph">Paragraph</SelectItem>
              <SelectItem value="h1">Heading 1</SelectItem>
              <SelectItem value="h2">Heading 2</SelectItem>
              <SelectItem value="h3">Heading 3</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <span className="mx-1 h-4 w-px bg-[#e3e3e3]" />

        <ToolbarButton
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>

        <span className="mx-1 h-4 w-px bg-[#e3e3e3]" />

        <ToolbarButton
          label="Align left"
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Align centre"
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Align right"
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          <AlignRight className="h-3.5 w-3.5" />
        </ToolbarButton>

        <span className="mx-1 h-4 w-px bg-[#e3e3e3]" />

        <ToolbarButton
          label="Bulleted list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Link" onClick={applyLink}>
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Clear formatting"
          onClick={() =>
            editor.chain().focus().unsetAllMarks().clearNodes().run()
          }
        >
          <RemoveFormatting className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="ml-auto">
          <ToolbarButton
            label={showHtml ? "Hide HTML" : "Show HTML"}
            active={showHtml}
            onClick={() => {
              if (showHtml) applyHtmlDraft();
              else setShowHtml(true);
            }}
          >
            <Code className="h-3.5 w-3.5" />
          </ToolbarButton>
        </div>
      </div>

      {showHtml ? (
        <div className="space-y-2 p-2">
          <textarea
            value={htmlDraft}
            onChange={(e) => setHtmlDraft(e.target.value)}
            rows={8}
            className="w-full resize-y rounded-md border border-[#e3e3e3] bg-white px-2 py-1.5 font-mono text-[12px] text-[#303030] outline-none focus:border-[#b5b5b5]"
            spellCheck={false}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="h-7 rounded-md px-2.5 text-[12px] font-medium text-[#616161] hover:bg-[#f1f1f1]"
              onClick={() => setShowHtml(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="h-7 rounded-md bg-[#303030] px-2.5 text-[12px] font-medium text-white hover:bg-black"
              onClick={applyHtmlDraft}
            >
              Apply HTML
            </button>
          </div>
        </div>
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  );
}
