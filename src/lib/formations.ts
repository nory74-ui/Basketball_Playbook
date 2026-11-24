import { CourtType, ObjectType, PlayObject } from '../types';

export type FormationCategory = 'offense' | 'defense' | 'matchup' | 'special';

export interface FormationObjectSpec {
  type: ObjectType;
  label: string | number;
  x: number;
  y: number;
}

export interface FormationTemplate {
  id: string;
  name: string;
  subtitle: string;
  category: FormationCategory;
  courtType: CourtType;
  objects: FormationObjectSpec[];
}

export const FORMATION_TEMPLATES: FormationTemplate[] = [
  {
    id: '5-out',
    name: '5-Out',
    subtitle: '全員が3Pライン外に広がる基本スペーシング',
    category: 'offense',
    courtType: 'half',
    objects: [
      { type: 'O', label: 1, x: 850, y: 1040 },
      { type: 'Ball', label: '', x: 905, y: 1055 },
      { type: 'O', label: 2, x: 1410, y: 720 },
      { type: 'O', label: 3, x: 290, y: 720 },
      { type: 'O', label: 4, x: 155, y: 290 },
      { type: 'O', label: 5, x: 1545, y: 290 },
    ],
  },
  {
    id: 'horns',
    name: 'Horns（ホーンズ）',
    subtitle: '両エルボーにビッグマン2人を置くセット起点',
    category: 'offense',
    courtType: 'half',
    objects: [
      { type: 'O', label: 1, x: 850, y: 1050 },
      { type: 'Ball', label: '', x: 905, y: 1065 },
      { type: 'O', label: 4, x: 595, y: 685 },
      { type: 'O', label: 5, x: 1105, y: 685 },
      { type: 'O', label: 2, x: 1545, y: 280 },
      { type: 'O', label: 3, x: 155, y: 280 },
    ],
  },
  {
    id: '4-out-1-in',
    name: '4-Out 1-In',
    subtitle: 'インサイドにセンター1人を残すバランス型',
    category: 'offense',
    courtType: 'half',
    objects: [
      { type: 'O', label: 1, x: 850, y: 1040 },
      { type: 'Ball', label: '', x: 905, y: 1055 },
      { type: 'O', label: 2, x: 1410, y: 720 },
      { type: 'O', label: 3, x: 290, y: 720 },
      { type: 'O', label: 4, x: 1545, y: 280 },
      { type: 'O', label: 5, x: 545, y: 360 },
    ],
  },
  {
    id: '1-4-high',
    name: '1-4 High',
    subtitle: 'フリースローライン上に4人が横並びするセット',
    category: 'offense',
    courtType: 'half',
    objects: [
      { type: 'O', label: 1, x: 850, y: 1060 },
      { type: 'Ball', label: '', x: 905, y: 1075 },
      { type: 'O', label: 3, x: 270, y: 685 },
      { type: 'O', label: 4, x: 595, y: 685 },
      { type: 'O', label: 5, x: 1105, y: 685 },
      { type: 'O', label: 2, x: 1430, y: 685 },
    ],
  },
  {
    id: 'blob-box',
    name: 'BLOB ボックス',
    subtitle: 'ベースラインからのインバウンズ定番フォーメーション',
    category: 'special',
    courtType: 'half',
    objects: [
      { type: 'O', label: 3, x: 550, y: 70 },
      { type: 'Ball', label: '', x: 600, y: 70 },
      { type: 'O', label: 1, x: 605, y: 660 },
      { type: 'O', label: 2, x: 1095, y: 660 },
      { type: 'O', label: 4, x: 605, y: 360 },
      { type: 'O', label: 5, x: 1095, y: 360 },
    ],
  },
  {
    id: '5v5-man',
    name: '5対5 マンツーマン',
    subtitle: '5-Out オフェンス対マンツーマン守備の標準配置',
    category: 'matchup',
    courtType: 'half',
    objects: [
      { type: 'O', label: 1, x: 850, y: 1050 },
      { type: 'Ball', label: '', x: 905, y: 1065 },
      { type: 'O', label: 2, x: 1410, y: 720 },
      { type: 'O', label: 3, x: 290, y: 720 },
      { type: 'O', label: 4, x: 155, y: 290 },
      { type: 'O', label: 5, x: 1545, y: 290 },
      { type: 'X', label: '×', x: 850, y: 900 },
      { type: 'X', label: '×', x: 1265, y: 625 },
      { type: 'X', label: '×', x: 435, y: 625 },
      { type: 'X', label: '×', x: 380, y: 300 },
      { type: 'X', label: '×', x: 1320, y: 300 },
    ],
  },
  {
    id: 'zone-2-3',
    name: '2-3 ゾーンディフェンス',
    subtitle: '前2人・後3人の基本ゾーン（既存オフェンスに追加も可）',
    category: 'defense',
    courtType: 'half',
    objects: [
      { type: 'X', label: '×', x: 650, y: 740 },
      { type: 'X', label: '×', x: 1050, y: 740 },
      { type: 'X', label: '×', x: 460, y: 420 },
      { type: 'X', label: '×', x: 850, y: 320 },
      { type: 'X', label: '×', x: 1240, y: 420 },
    ],
  },
  {
    id: 'zone-3-2',
    name: '3-2 ゾーンディフェンス',
    subtitle: '外角シューターを警戒する前3人・後2人ゾーン',
    category: 'defense',
    courtType: 'half',
    objects: [
      { type: 'X', label: '×', x: 850, y: 840 },
      { type: 'X', label: '×', x: 470, y: 620 },
      { type: 'X', label: '×', x: 1230, y: 620 },
      { type: 'X', label: '×', x: 630, y: 340 },
      { type: 'X', label: '×', x: 1070, y: 340 },
    ],
  },
  {
    id: 'full-transition',
    name: 'フルコート 速攻配置',
    subtitle: 'ディフェンスリバウンドからのトランジション開始',
    category: 'special',
    courtType: 'full',
    objects: [
      { type: 'O', label: 5, x: 850, y: 2630 },
      { type: 'Ball', label: '', x: 905, y: 2610 },
      { type: 'O', label: 1, x: 1250, y: 2220 },
      { type: 'O', label: 2, x: 1470, y: 1750 },
      { type: 'O', label: 3, x: 230, y: 1800 },
      { type: 'O', label: 4, x: 620, y: 2350 },
    ],
  },
];

export function instantiateFormationObjects(template: FormationTemplate): PlayObject[] {
  const base = Date.now();
  return template.objects.map((spec, idx) => ({
    id: `${base}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
    type: spec.type,
    label: spec.label,
    x: spec.x,
    y: spec.y,
  }));
}
