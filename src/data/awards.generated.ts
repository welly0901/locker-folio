/* eslint-disable */
// 由 scripts/assets/build-awards.mjs 生成，请勿手改。
// 每张奖状的展示尺寸与专属氛围色（深度画廊背景按此交叉渐变）。
export const AWARDS = [
  {
    "id": "award-01",
    "w": 851,
    "h": 1200,
    "bg": "#f7f4ef",
    "blob1": "#cabb88",
    "blob2": "#e3dbc1"
  },
  {
    "id": "award-02",
    "w": 1200,
    "h": 845,
    "bg": "#f4ece5",
    "blob1": "#d53a3d",
    "blob2": "#e69c9a"
  },
  {
    "id": "award-03",
    "w": 1200,
    "h": 799,
    "bg": "#f0ebe5",
    "blob1": "#994b43",
    "blob2": "#c9a39c"
  },
  {
    "id": "award-04",
    "w": 539,
    "h": 765,
    "bg": "#f5eae3",
    "blob1": "#da4e40",
    "blob2": "#e8a499"
  },
  {
    "id": "award-05",
    "w": 841,
    "h": 1200,
    "bg": "#f6eae3",
    "blob1": "#de3c34",
    "blob2": "#eb9c94"
  },
  {
    "id": "award-06",
    "w": 891,
    "h": 1200,
    "bg": "#f7f4ee",
    "blob1": "#bd7946",
    "blob2": "#ddbca2"
  },
  {
    "id": "award-07",
    "w": 1200,
    "h": 854,
    "bg": "#f5efe7",
    "blob1": "#d18755",
    "blob2": "#e4c0a5"
  },
  {
    "id": "award-08",
    "w": 891,
    "h": 1200,
    "bg": "#f7f4ee",
    "blob1": "#cd7a5a",
    "blob2": "#e5bdab"
  },
  {
    "id": "award-09",
    "w": 1200,
    "h": 845,
    "bg": "#f5f0e8",
    "blob1": "#e0a046",
    "blob2": "#eccc9f"
  },
  {
    "id": "award-10",
    "w": 891,
    "h": 1200,
    "bg": "#f1f0ed",
    "blob1": "#ac9199",
    "blob2": "#d2c5c7"
  },
  {
    "id": "award-11",
    "w": 891,
    "h": 1200,
    "bg": "#f5eee8",
    "blob1": "#c47760",
    "blob2": "#dfb8ab"
  },
  {
    "id": "award-12",
    "w": 891,
    "h": 1200,
    "bg": "#f5eee8",
    "blob1": "#c47760",
    "blob2": "#dfb8ab"
  },
  {
    "id": "award-13",
    "w": 891,
    "h": 1200,
    "bg": "#eef0ed",
    "blob1": "#4fa5c7",
    "blob2": "#a6cedc"
  }
] as const

export type AwardImage = (typeof AWARDS)[number]
