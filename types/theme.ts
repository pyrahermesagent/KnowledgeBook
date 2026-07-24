// Theme Types and Interfaces

export type ThemeType = 'light' | 'dark' | 'auto';
export type LayoutPosition = 'left' | 'right' | 'top';
export type SpacingScale = 'compact' | 'normal' | 'spacious';

export interface ColorPalette {
  primary: string;
  primaryHover: string;
  secondary: string;
  secondaryHover: string;
  accent: string;
  accentSoft: string;
  background: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  radius: string;
  sidebarWidth: string;
  font: string;
  mono: string;
}

export interface SidebarConfig {
  width: number;
  position: LayoutPosition;
  collapsed: boolean;
}

export interface HeaderConfig {
  height: number;
  visible: boolean;
  sticky: boolean;
}

export interface FooterConfig {
  visible: boolean;
  height: number;
}

export interface SpacingConfig {
  unit: number;
  scale: SpacingScale;
}

export interface LayoutConfig {
  sidebar: SidebarConfig;
  header: HeaderConfig;
  footer: FooterConfig;
  spacing: SpacingConfig;
}

export interface TypographyConfig {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  headingSize: number;
}

export interface ComponentStyles {
  button: {
    borderRadius: number;
    padding: string;
  };
  card: {
    borderRadius: number;
    shadow: string;
  };
  input: {
    borderRadius: number;
    borderColor: string;
  };
}

export interface Theme {
  id: string;
  name: string;
  type: ThemeType;
  colors: ColorPalette;
  layout: LayoutConfig;
  typography: TypographyConfig;
  components: ComponentStyles;
  createdAt: string;
  updatedAt: string;
  isDefault: boolean;
}

export interface ThemeStore {
  getTheme(id: string): Theme | undefined;
  getAllThemes(): Theme[];
  setActiveTheme(id: string): Promise<void>;
  getDefaultTheme(): Theme | undefined;
  setDefaultTheme(id: string): Promise<void>;
  saveTheme(theme: Theme): Promise<void>;
  deleteTheme(id: string): Promise<void>;
  getActiveThemeId(): string | null;
}
