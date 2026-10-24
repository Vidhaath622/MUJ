import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress, CircularProgress } from '../ui/progress';
import { Input } from '../ui/input';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { Card, CardTitle } from '../ui/card';
import { Search, Sparkles } from 'lucide-react';

export const PrimitivesTab: React.FC = () => {
  const [sliderVal, setSliderVal] = useState(75);
  const [switchChecked, setSwitchChecked] = useState(true);
  const [loadingBtn, setLoadingBtn] = useState(false);

  return (
    <div className="space-y-8">
      {/* 1. Buttons & Variants */}
      <Card className="p-6 bg-[var(--panel)] border-[var(--rule)] space-y-4">
        <div>
          <span className="text-xs font-mono uppercase text-[var(--accent)]">01 / Actions</span>
          <CardTitle className="text-lg mt-1">Button Tokens &amp; Variants</CardTitle>
          <p className="text-xs text-[var(--ink-2)]">
            Inspired by Shadcn UI, AlignUI, and Magic UI (Shine &amp; Glow variants).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button variant="default">Default White</Button>
          <Button variant="primary">Primary Blue</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="glow">
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Glow Gradient
          </Button>
          <Button variant="shine">Shine Sheen</Button>
          <Button
            variant="primary"
            isLoading={loadingBtn}
            onClick={() => {
              setLoadingBtn(true);
              setTimeout(() => setLoadingBtn(false), 2000);
            }}
          >
            {loadingBtn ? 'Evaluating...' : 'Test Loading State'}
          </Button>
        </div>
      </Card>

      {/* 2. Badges & Pulsing Status Indicators */}
      <Card className="p-6 bg-[var(--panel)] border-[var(--rule)] space-y-4">
        <div>
          <span className="text-xs font-mono uppercase text-[var(--ok)]">02 / Feedback</span>
          <CardTitle className="text-lg mt-1">Status Badges &amp; Live Dots</CardTitle>
          <p className="text-xs text-[var(--ink-2)]">
            Inspired by Untitled UI, HeroUI, and Base UI.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Badge variant="success" dot pulse>
            EVALUATION ONLINE
          </Badge>
          <Badge variant="danger" dot pulse>
            RETRIEVAL FAILED
          </Badge>
          <Badge variant="warning" dot>
            LATENCY SPIKE
          </Badge>
          <Badge variant="info" dot>
            BM25 + DENSE
          </Badge>
          <Badge variant="purple" dot>
            NLI GROUNDED
          </Badge>
          <Badge variant="neon">
            MAGIC NEON
          </Badge>
          <Badge variant="outline">
            v1.4.0
          </Badge>
        </div>
      </Card>

      {/* 3. Progress Bars (Linear & Circular Gauges) */}
      <Card className="p-6 bg-[var(--panel)] border-[var(--rule)] space-y-6">
        <div>
          <span className="text-xs font-mono uppercase text-[var(--retr)]">03 / Progress</span>
          <CardTitle className="text-lg mt-1">Linear &amp; Circular Progress Gauges</CardTitle>
          <p className="text-xs text-[var(--ink-2)]">
            Adaptive color shifts: Green (&ge; 70%), Amber (50-69%), Red (&lt; 50%).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div className="space-y-4">
            <div>
              <span className="text-xs font-mono text-[var(--ink-2)] block mb-1">Context Relevance (94%)</span>
              <Progress value={94} thresholdPass={70} />
            </div>
            <div>
              <span className="text-xs font-mono text-[var(--ink-2)] block mb-1">Faithfulness (32% - Fail)</span>
              <Progress value={32} thresholdPass={75} />
            </div>
            <div>
              <span className="text-xs font-mono text-[var(--ink-2)] block mb-1">Semantic Accuracy (62% - Warn)</span>
              <Progress value={62} thresholdPass={70} thresholdWarn={50} />
            </div>
          </div>

          <div className="flex items-center justify-around">
            <CircularProgress value={94} label="Context" size={88} strokeWidth={7} />
            <CircularProgress value={32} label="Faith" size={88} strokeWidth={7} thresholdPass={75} />
            <CircularProgress value={85} label="Accuracy" size={88} strokeWidth={7} />
          </div>
        </div>
      </Card>

      {/* 4. Inputs, Sliders, and Switches */}
      <Card className="p-6 bg-[var(--panel)] border-[var(--rule)] space-y-6">
        <div>
          <span className="text-xs font-mono uppercase text-[var(--accent)]">04 / Form Controls</span>
          <CardTitle className="text-lg mt-1">Inputs, Threshold Sliders &amp; Switches</CardTitle>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-mono text-[var(--ink-2)]">Search Input with Shortcut</label>
            <Input
              icon={<Search className="w-4 h-4" />}
              shortcut="⌘K"
              placeholder="Search evaluation test cases..."
            />
          </div>

          <div className="space-y-2">
            <Slider
              label="Confidence Threshold"
              value={sliderVal}
              min={0}
              max={100}
              valueDisplay={`${sliderVal}%`}
              onChange={(e) => setSliderVal(parseInt(e.target.value))}
            />
          </div>

          <div className="flex flex-col justify-end">
            <Switch
              label="Strict NLI Mode"
              description="Treat unmentioned statements as hallucinations"
              checked={switchChecked}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSwitchChecked(e.target.checked)}
            />
          </div>
        </div>
      </Card>
    </div>
  );
};
