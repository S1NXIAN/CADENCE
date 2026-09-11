"use client";

import type { Settings } from "@/lib/typing/types";
import { ACCENT_COLORS } from "@/lib/typing/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export function SettingsModal({ open, onOpenChange, settings, update }: SettingsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface slim-scroll max-h-[85vh] max-w-lg overflow-y-auto font-mono" style={{ borderColor: "#23252b" }}>
        <DialogHeader>
          <DialogTitle className="font-mono">settings</DialogTitle>
          <DialogDescription className="text-dim font-mono text-xs">
            saved locally, applied instantly
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* adaptive intensity */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">adaptive intensity</Label>
              <span className="text-hue text-sm tabular-nums">{settings.adaptiveIntensity}%</span>
            </div>
            <Slider
              value={[settings.adaptiveIntensity]}
              min={0}
              max={100}
              step={5}
              onValueChange={(v) => update({ adaptiveIntensity: v[0] })}
            />
            <p className="text-dim text-xs leading-relaxed">
              How hard the generator leans into your weak keys. Low = gentle mix, high = relentless
              drilling on problem letters and pairs.
            </p>
          </div>

          <div className="space-y-4">
            <ToggleRow
              label="strict mode"
              hint="disable backspace — forces clean muscle memory"
              checked={settings.strictMode}
              onChange={(v) => update({ strictMode: v })}
            />
            <ToggleRow
              label="punctuation"
              hint="sprinkle capitals and punctuation into tests"
              checked={settings.punctuation}
              onChange={(v) => update({ punctuation: v })}
            />
            <ToggleRow
              label="numbers"
              hint="mix in random numbers"
              checked={settings.numbers}
              onChange={(v) => update({ numbers: v })}
            />
            <ToggleRow
              label="live wpm"
              hint="show speed while typing"
              checked={settings.liveWpm}
              onChange={(v) => update({ liveWpm: v })}
            />
            <ToggleRow
              label="coach notes"
              hint="post-test analysis and tips"
              checked={settings.showCoach}
              onChange={(v) => update({ showCoach: v })}
            />
            <ToggleRow
              label="keypress sound"
              hint="soft click on every keystroke"
              checked={settings.sound}
              onChange={(v) => update({ sound: v })}
            />
          </div>

          {/* caret style */}
          <div className="space-y-3">
            <Label className="text-sm">caret style</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["line", "block", "underline"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => update({ caretStyle: c })}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    settings.caretStyle === c
                      ? "border-hue/50 bg-hue/10 text-hue"
                      : "border-[#23252b] text-dim hover:text-foreground"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* accent */}
          <div className="space-y-3">
            <Label className="text-sm">accent color</Label>
            <div className="flex gap-3">
              {(Object.keys(ACCENT_COLORS) as (keyof typeof ACCENT_COLORS)[]).map((a) => (
                <button
                  key={a}
                  onClick={() => update({ accent: a })}
                  aria-label={`accent ${ACCENT_COLORS[a].name}`}
                  className={`h-9 w-9 rounded-full border-2 transition-transform hover:scale-110 ${
                    settings.accent === a ? "border-foreground" : "border-transparent"
                  }`}
                  style={{ backgroundColor: ACCENT_COLORS[a].hue }}
                />
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm">{label}</div>
        <div className="text-dim text-xs">{hint}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
