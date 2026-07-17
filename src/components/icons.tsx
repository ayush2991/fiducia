import Svg, { Circle, Path, Polyline } from 'react-native-svg';

type IconProps = {
  color: string;
};

export function OverviewIcon({ color }: IconProps) {
  return (
    <Svg width={19} height={19} viewBox="0 0 19 19" fill="none">
      <Path d="M3 8.5L9.5 3l6.5 5.5" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 8v7h9V8" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function CompareIcon({ color }: IconProps) {
  return (
    <Svg width={19} height={19} viewBox="0 0 19 19" fill="none">
      <Path d="M2 15V9M7 15V5M12 15V10M17 15V3" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

export function WatchlistIcon({ color }: IconProps) {
  return (
    <Svg width={19} height={19} viewBox="0 0 19 19" fill="none">
      <Path
        d="M9.5 2.5l2.1 4.4 4.8.6-3.5 3.4.9 4.8-4.3-2.3-4.3 2.3.9-4.8-3.5-3.4 4.8-.6z"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function AccountIcon({ color }: IconProps) {
  return (
    <Svg width={19} height={19} viewBox="0 0 19 19" fill="none">
      <Circle cx={9.5} cy={6.5} r={3.2} stroke={color} strokeWidth={1.5} />
      <Path d="M3 16.5c1.3-3.3 4-4.8 6.5-4.8s5.2 1.5 6.5 4.8" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

export function BackIcon({ color }: IconProps) {
  return (
    <Svg width={9} height={16} viewBox="0 0 9 16">
      <Polyline points="8,1 1,8 8,15" fill="none" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

export function PlusIcon({ color }: IconProps) {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14">
      <Path d="M7 1v12M1 7h12" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

export function EmptyPortfoliosIcon() {
  return (
    <Svg width={40} height={40} viewBox="0 0 40 40">
      <Circle cx={20} cy={20} r={18} fill="none" stroke="#2c2f40" strokeWidth={1.5} />
      <Path d="M20 12v16M12 20h16" stroke="#595d6c" strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}
