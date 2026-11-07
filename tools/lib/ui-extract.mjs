// Inventories shipped UI definition files (GtkBuilder .ui/.glade today) into screen candidates:
// one entry per top-level window with its title, labels, input widgets, check boxes and buttons.
// These files ship with the application as resources: reading them is not decompilation.
import fs from "node:fs";
import path from "node:path";

const INPUT = /^(GtkEntry|GtkSpinButton|GtkComboBox|GtkComboBoxText|GtkTextView|GtkTreeView|GtkCalendar|GncDateEdit|GncAmountEdit|GtkSearchEntry|GtkFileChooserButton)$/;
const TOP = /^(GtkDialog|GtkWindow|GtkAssistant|GtkApplicationWindow|GtkMessageDialog|GtkBox|GtkGrid|GtkNotebook|GtkPopover)$/;
const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/_(?=\w)/g, "").trim();

export function parseGtkBuilder(xml) {
  const tops = [];
  const stack = [];
  let prop = null;
  const re = /<(\/?)(object|property|interface)\b([^>]*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const [, close, tag, attrs, selfClose, text] = m;
    if (text !== undefined) {
      if (prop && stack.length && text.trim()) stack.at(-1).props[prop] = decode(text);
      continue;
    }
    if (tag === "object") {
      if (close) {
        const o = stack.pop();
        if (!o) continue;
        if (stack.length) stack.at(-1).children.push(o);
        else tops.push(o);
      } else {
        const cls = /class="([^"]+)"/.exec(attrs)?.[1] ?? "?";
        const id = /id="([^"]+)"/.exec(attrs)?.[1] ?? "";
        const o = { cls, id, props: {}, children: [] };
        if (selfClose) (stack.length ? stack.at(-1).children : tops).push(o);
        else stack.push(o);
      }
    } else if (tag === "property") {
      prop = close || selfClose ? null : /name="([^"]+)"/.exec(attrs)?.[1] ?? null;
    }
  }
  const flatten = (o, out = []) => { out.push(o); o.children.forEach((c) => flatten(c, out)); return out; };
  return tops
    .filter((t) => TOP.test(t.cls) || t.props.title)
    .map((t) => {
      const all = flatten(t).slice(1);
      const uniq = (a) => [...new Set(a.filter(Boolean))];
      return {
        id: t.id,
        class: t.cls,
        title: t.props.title ?? "",
        labels: uniq(all.filter((o) => o.cls === "GtkLabel").map((o) => o.props.label)).slice(0, 60),
        inputs: all.filter((o) => INPUT.test(o.cls)).map((o) => ({ class: o.cls, id: o.id, tooltip: o.props.tooltip_text ?? o.props.tooltip_markup ?? undefined })).slice(0, 60),
        checks: uniq(all.filter((o) => /GtkCheckButton|GtkRadioButton|GtkSwitch/.test(o.cls)).map((o) => o.props.label || o.id)).slice(0, 40),
        buttons: uniq(all.filter((o) => /^GtkButton$/.test(o.cls)).map((o) => o.props.label || o.id)).slice(0, 30),
        widgets: all.length,
      };
    })
    .filter((s) => s.title || s.inputs.length || s.labels.length > 2);
}

export function inventoryUi(input) {
  const files = [];
  const walk = (p) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) for (const e of fs.readdirSync(p)) walk(path.join(p, e));
    else if (/\.(ui|glade)$/i.test(p)) files.push(p);
  };
  walk(input);
  const out = [];
  for (const f of files) {
    const xml = fs.readFileSync(f, "utf8");
    if (!/<interface/.test(xml)) continue;
    for (const s of parseGtkBuilder(xml)) out.push({ file: path.relative(fs.statSync(input).isDirectory() ? input : path.dirname(input), f).split(path.sep).join("/"), ...s });
  }
  return { format: "gtkbuilder", files: files.length, screens: out };
}
