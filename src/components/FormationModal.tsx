import React, { useState } from 'react';
import { LayoutGrid, X } from 'lucide-react';
import {
  FORMATION_TEMPLATES,
  FormationCategory,
  FormationTemplate,
} from '../lib/formations';
import { CANVAS_WIDTH, getCanvasHeight } from '../lib/renderer';

interface FormationModalProps {
  onSelect: (template: FormationTemplate, mode: 'replace' | 'append') => void;
  onClose: () => void;
}

const CATEGORY_TABS: { id: 'all' | FormationCategory; label: string }[] = [
  { id: 'all', label: 'すべて' },
  { id: 'offense', label: 'オフェンス' },
  { id: 'defense', label: 'ディフェンス' },
  { id: 'matchup', label: '攻守セット' },
  { id: 'special', label: 'インバウンズ・速攻' },
];

const FormationMiniPreview = ({ template }: { template: FormationTemplate }) => {
  const height = getCanvasHeight(template.courtType);
  const isFull = template.courtType === 'full';

  return (
    <svg
      viewBox={`0 0 ${CANVAS_WIDTH} ${height}`}
      className={`w-full ${isFull ? 'h-28' : 'h-24'} rounded border border-amber-200 bg-[#eaddcf]`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Outer court boundary */}
      <rect
        x={100}
        y={100}
        width={1500}
        height={isFull ? 2800 : 1400}
        fill="none"
        stroke="#ffffff"
        strokeWidth={18}
      />
      {/* Top paint & 3pt */}
      <rect x={605} y={100} width={490} height={580} fill="#e2cba0" stroke="#ffffff" strokeWidth={16} />
      <circle cx={850} cy={680} r={180} fill="none" stroke="#ffffff" strokeWidth={16} />
      <path
        d="M 190 100 L 190 399 A 675 675 0 0 0 1510 399 L 1510 100"
        fill="none"
        stroke="#ffffff"
        strokeWidth={16}
      />
      <circle cx={850} cy={257.5} r={34} fill="none" stroke="#ea580c" strokeWidth={14} />

      {isFull && (
        <>
          <line x1={100} y1={1500} x2={1600} y2={1500} stroke="#ffffff" strokeWidth={18} />
          <circle cx={850} cy={1500} r={180} fill="none" stroke="#ffffff" strokeWidth={16} />
          <rect
            x={605}
            y={2320}
            width={490}
            height={580}
            fill="#e2cba0"
            stroke="#ffffff"
            strokeWidth={16}
          />
          <circle cx={850} cy={2742.5} r={34} fill="none" stroke="#ea580c" strokeWidth={14} />
        </>
      )}

      {/* Objects */}
      {template.objects.map((obj, idx) => {
        if (obj.type === 'Ball') {
          return (
            <circle
              key={idx}
              cx={obj.x}
              cy={obj.y}
              r={42}
              fill="#ea580c"
              stroke="#431407"
              strokeWidth={10}
            />
          );
        }
        const isOffense = obj.type === 'O';
        return (
          <g key={idx}>
            <circle
              cx={obj.x}
              cy={obj.y}
              r={68}
              fill={isOffense ? '#dc2626' : '#1e293b'}
              stroke="#ffffff"
              strokeWidth={14}
            />
            <text
              x={obj.x}
              y={obj.y + 6}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#ffffff"
              fontSize={72}
              fontWeight="bold"
              fontFamily="system-ui, sans-serif"
            >
              {obj.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export const FormationModal: React.FC<FormationModalProps> = ({ onSelect, onClose }) => {
  const [category, setCategory] = useState<'all' | FormationCategory>('all');
  const [applyMode, setApplyMode] = useState<'replace' | 'append'>('replace');

  const filtered =
    category === 'all'
      ? FORMATION_TEMPLATES
      : FORMATION_TEMPLATES.filter((t) => t.category === category);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[86vh]"
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
            <LayoutGrid className="text-orange-600" size={20} /> フォーメーション定型配置
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:bg-gray-100 p-1.5 rounded-full transition"
            aria-label="閉じる"
          >
            <X size={20} />
          </button>
        </div>

        {/* Controls Bar: Categories + Replace/Append Mode */}
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/70 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategory(tab.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                  category === tab.id
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-md p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setApplyMode('replace')}
              className={`px-2.5 py-1 rounded transition font-medium ${
                applyMode === 'replace'
                  ? 'bg-slate-800 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              title="現在のフレームの選手とラインを入れ替えます"
            >
              入替配置
            </button>
            <button
              type="button"
              onClick={() => setApplyMode('append')}
              className={`px-2.5 py-1 rounded transition font-medium ${
                applyMode === 'append'
                  ? 'bg-slate-800 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              title="既存の選手を残したまま重ねて配置します（例：オフェンスにゾーン守備を追加）"
            >
              重ねて追加
            </button>
          </div>
        </div>

        {/* Template Grid */}
        <div className="overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {filtered.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelect(template, applyMode)}
              className="text-left bg-white border border-gray-200 hover:border-orange-500 hover:ring-2 hover:ring-orange-500/20 rounded-lg p-2.5 transition flex flex-col gap-2 group"
            >
              <FormationMiniPreview template={template} />
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-sm text-gray-800 group-hover:text-orange-600 transition truncate">
                    {template.name}
                  </span>
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded shrink-0">
                    {template.courtType === 'full' ? 'フル' : 'ハーフ'}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2 leading-snug">
                  {template.subtitle}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
