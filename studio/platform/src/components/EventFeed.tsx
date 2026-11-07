"use client";

import {
  BookMarked,
  CheckCheck,
  CircleX,
  DatabaseZap,
  Dot,
  FlaskConical,
  Flag,
  LayoutTemplate,
  Lightbulb,
  MousePointerClick,
  Play,
  ScanSearch,
  Send,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { AgentEvent, EventType } from "@/lib/types";
import { cx, timeOf } from "./ui";
import { useReborn } from "./RebornProvider";
import { MODE_INFO } from "@/lib/modes";

const TYPE: Record<EventType, { icon: LucideIcon; cls: string }> = {
  investigation_started: { icon: Play, cls: "text-ink bg-chalk-2" },
  investigation_completed: { icon: Flag, cls: "text-ink bg-chalk-2" },
  action: { icon: MousePointerClick, cls: "text-ink-3 bg-[#e6ecf5]" },
  observation: { icon: FlaskConical, cls: "text-ink bg-chalk-2" },
  form_discovered: { icon: ScanSearch, cls: "text-ink-3 bg-[#e6ecf5]" },
  hypothesis: { icon: Lightbulb, cls: "text-ochre bg-ochre-soft" },
  experiment_request: { icon: Send, cls: "text-ochre bg-ochre-soft" },
  rules_updated: { icon: BookMarked, cls: "text-verdigris bg-verdigris-soft" },
  schema_updated: { icon: LayoutTemplate, cls: "text-ink-3 bg-[#e6ecf5]" },
  validation: { icon: CheckCheck, cls: "text-verdigris bg-verdigris-soft" },
  drift: { icon: TriangleAlert, cls: "text-rust bg-rust-soft" },
  log: { icon: Dot, cls: "text-silt bg-chalk-2" },
  error: { icon: CircleX, cls: "text-rust bg-rust-soft" },
  migration: { icon: DatabaseZap, cls: "text-verdigris bg-verdigris-soft" },
};

export const SOURCE_LABEL: Record<AgentEvent["source"], string> = {
  explorer: "Explorer",
  analyst: "Analyste",
  platform: "REBORN",
  user: "Opérateur",
};

export function EventFeed({ events, limit, dense, emptyHint }: { events: AgentEvent[]; limit?: number; dense?: boolean; emptyHint?: string }) {
  const { state } = useReborn();
  const modeOf = new Map((state?.investigations ?? []).map((i) => [i.id, i.mode]));
  const list = [...events].reverse().slice(0, limit ?? events.length);
  if (!list.length) {
    return <div className="py-8 text-center text-[13px] text-silt">{emptyHint ?? "Le journal est vide. Lancez une investigation pour voir les agents travailler."}</div>;
  }
  return (
    <ol className="relative">
      {list.map((e) => {
        const t = TYPE[e.type] ?? TYPE.log;
        const Icon = t.icon;
        const failed = e.type === "validation" && typeof (e.data as { equivalence?: number })?.equivalence === "number" && (e.data as { equivalence: number }).equivalence < 1;
        return (
          <li key={e.id} className={cx("enter grid grid-cols-[56px_22px_1fr] gap-x-2.5 border-b border-line last:border-0", dense ? "py-1.5" : "py-2.5")}>
            <time className="tabular pt-0.5 font-mono text-[11px] text-silt" dateTime={e.ts}>
              {timeOf(e.ts)}
            </time>
            <span className={cx("mt-px flex size-[22px] items-center justify-center rounded-xs", failed ? "bg-ochre-soft text-ochre" : t.cls)}>
              <Icon size={13} strokeWidth={2.25} aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="shrink-0 font-mono text-[10px] font-medium tracking-wider text-silt uppercase">{SOURCE_LABEL[e.source]}</span>
                {(e.source === "explorer" || e.source === "analyst") && modeOf.has(e.investigation_id ?? "") && MODE_INFO[modeOf.get(e.investigation_id!)!].group === "local" && (
                  <span className="shrink-0 rounded-xs bg-ochre-soft px-1 font-mono text-[9.5px] font-bold tracking-wider text-ochre uppercase" title={MODE_INFO[modeOf.get(e.investigation_id!)!].detail}>
                    local
                  </span>
                )}
                <span className={cx("min-w-0 text-[13px] leading-snug", e.type === "drift" ? "font-bold text-rust" : e.type === "action" ? "text-sediment" : "text-ink")}>
                  {e.title}
                </span>
              </div>
              {e.detail && !dense && <p className="mt-0.5 text-[12px] leading-snug text-sediment">{e.detail}</p>}
              {e.screenshot_url && !dense && (
                <a href={e.screenshot_url} target="_blank" rel="noreferrer" className="mt-1.5 block w-fit">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={e.screenshot_url} alt={`Capture — ${e.title}`} className="max-h-28 rounded-xs outline outline-1 -outline-offset-1 outline-black/10" />
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
