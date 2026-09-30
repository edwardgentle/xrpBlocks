/**
 * XRP Blocks — Custom Blockly Theme (Pastel, child-friendly)
 * Uses the Zelos renderer for Scratch 3.0 block shapes.
 */

/**
 * @param {'light'|'dark'} [mode='light'] Which palette to build.
 * @param {{blockStyles: Object, categoryStyles: Object}} [extra] Styles
 *   contributed by device libraries (devices/*.json). They are merged in last,
 *   so a library can never quietly redefine a built-in category.
 * @returns {!Blockly.Theme}
 */
export function createXRPTheme(mode = 'light', extra = null) {
  if (mode === 'dark') return createDarkTheme(extra);

  // Block style definitions — pastel colors
  const blockStyles = {
    // XRP-specific categories
    events_blocks: {
      colourPrimary: '#FFCA28',
      colourSecondary: '#FFE082',
      colourTertiary: '#FFB300',
      hat: 'cap',
    },
    drive_blocks: {
      colourPrimary: '#7CB9F0',
      colourSecondary: '#A8D4F7',
      colourTertiary: '#5A9FDE',
      hat: '',
    },
    motor_blocks: {
      colourPrimary: '#B39DDB',
      colourSecondary: '#D1C4E9',
      colourTertiary: '#9575CD',
      hat: '',
    },
    servo_blocks: {
      colourPrimary: '#FFB74D',
      colourSecondary: '#FFCC80',
      colourTertiary: '#FFA726',
      hat: '',
    },
    sensor_blocks: {
      colourPrimary: '#81C784',
      colourSecondary: '#A5D6A7',
      colourTertiary: '#66BB6A',
      hat: '',
    },
    board_blocks: {
      colourPrimary: '#FFD54F',
      colourSecondary: '#FFE082',
      colourTertiary: '#FFCA28',
      hat: '',
    },


    // Standard Blockly categories — pastel overrides
    logic_blocks: {
      colourPrimary: '#82B1FF',
      colourSecondary: '#B3D4FF',
      colourTertiary: '#5C8BCC',
      hat: '',
    },
    loop_blocks: {
      colourPrimary: '#80CBC4',
      colourSecondary: '#B2DFDB',
      colourTertiary: '#5BACA4',
      hat: '',
    },
    math_blocks: {
      colourPrimary: '#EF9A9A',
      colourSecondary: '#F5C6C6',
      colourTertiary: '#D47C7C',
      hat: '',
    },
    text_blocks: {
      colourPrimary: '#CE93D8',
      colourSecondary: '#E1BEE7',
      colourTertiary: '#AB47BC',
      hat: '',
    },
    list_blocks: {
      colourPrimary: '#90CAF9',
      colourSecondary: '#BBDEFB',
      colourTertiary: '#64B5F6',
      hat: '',
    },
    variable_blocks: {
      colourPrimary: '#FFAB91',
      colourSecondary: '#FFCCBC',
      colourTertiary: '#FF8A65',
      hat: '',
    },
    procedure_blocks: {
      colourPrimary: '#A5D6A7',
      colourSecondary: '#C8E6C9',
      colourTertiary: '#81C784',
      hat: '',
    },
    colour_blocks: {
      colourPrimary: '#F48FB1',
      colourSecondary: '#F8BBD0',
      colourTertiary: '#EC407A',
      hat: '',
    },
  };

  // Category style definitions (toolbox sidebar color indicators)
  const categoryStyles = {
    pinned_category: { colour: '#FFB300' },
    events_category: { colour: '#FFCA28' },
    drive_category: { colour: '#7CB9F0' },
    motor_category: { colour: '#B39DDB' },
    servo_category: { colour: '#FFB74D' },
    sensor_category: { colour: '#81C784' },
    board_category: { colour: '#FFD54F' },
    logic_category: { colour: '#82B1FF' },
    loop_category: { colour: '#80CBC4' },
    math_category: { colour: '#EF9A9A' },
    text_category: { colour: '#CE93D8' },
    list_category: { colour: '#90CAF9' },
    variable_category: { colour: '#FFAB91' },
    procedure_category: { colour: '#A5D6A7' },
    colour_category: { colour: '#F48FB1' },
  };

  // Component styles — workspace chrome
  const componentStyles = {
    workspaceBackgroundColour: '#F8F9FC',
    toolboxBackgroundColour: '#FFFFFF',
    toolboxForegroundColour: '#2D3142',
    flyoutBackgroundColour: '#F0F2F8',
    flyoutForegroundColour: '#2D3142',
    flyoutOpacity: 0.97,
    scrollbarColour: '#D1D5E0',
    scrollbarOpacity: 0.6,
    insertionMarkerColour: '#6C63FF',
    insertionMarkerOpacity: 0.4,
    markerColour: '#6C63FF',
    cursorColour: '#6C63FF',
    selectedGlowColour: '#6C63FF',
    selectedGlowOpacity: 0.2,
    replacementGlowColour: '#6C63FF',
    replacementGlowOpacity: 0.2,
  };

  // Font style
  const fontStyle = {
    family: "'Nunito', 'Segoe UI', system-ui, sans-serif",
    weight: '700',
    size: 12,
  };

  // Start blocks get a hat (cap) shape
  const startHat = true;

  mergeExtra(blockStyles, categoryStyles, extra);

  return Blockly.Theme.defineTheme('xrp_pastel', {
    name: 'xrp_pastel',
    blockStyles,
    categoryStyles,
    componentStyles,
    fontStyle,
    startHats: startHat,
  });
}


/**
 * Dark theme.
 *
 * The pastel light palette puts white text on very pale blocks, which is hard
 * to read: the yellow Board blocks measure 1.41:1 against white, far below the
 * 4.5:1 that WCAG AA asks for normal text. Every colour here keeps its hue but
 * is deepened and saturated until white text passes 4.5:1, so the categories
 * stay recognisable while the labels become legible.
 */
function createDarkTheme(extra = null) {
  const blockStyles = {
    events_blocks: {
      colourPrimary: '#967100',
      colourSecondary: '#C1940A',
      colourTertiary: '#6C5200',
      hat: 'cap',
    },
    drive_blocks: {
      colourPrimary: '#0076DF',
      colourSecondary: '#399CF5',
      colourTertiary: '#0055A1',
      hat: '',
    },
    motor_blocks: {
      colourPrimary: '#8A5DDA',
      colourSecondary: '#CBB9EC',
      colourTertiary: '#5C2AB7',
      hat: '',
    },
    servo_blocks: {
      colourPrimary: '#AC6600',
      colourSecondary: '#DD880C',
      colourTertiary: '#7C4A00',
      hat: '',
    },
    sensor_blocks: {
      colourPrimary: '#2A882E',
      colourSecondary: '#3FB244',
      colourTertiary: '#1E6221',
      hat: '',
    },
    board_blocks: {
      colourPrimary: '#957100',
      colourSecondary: '#BF940A',
      colourTertiary: '#6B5200',
      hat: '',
    },
    logic_blocks: {
      colourPrimary: '#166DFF',
      colourSecondary: '#7EACF8',
      colourTertiary: '#004BC7',
      hat: '',
    },
    loop_blocks: {
      colourPrimary: '#24847B',
      colourSecondary: '#37ACA1',
      colourTertiary: '#1A5F59',
      hat: '',
    },
    math_blocks: {
      colourPrimary: '#EE0505',
      colourSecondary: '#F35656',
      colourTertiary: '#AC0404',
      hat: '',
    },
    text_blocks: {
      colourPrimary: '#BC38D3',
      colourSecondary: '#D38ADF',
      colourTertiary: '#8C239D',
      hat: '',
    },
    list_blocks: {
      colourPrimary: '#0077D8',
      colourSecondary: '#309CF4',
      colourTertiary: '#00569C',
      hat: '',
    },
    variable_blocks: {
      colourPrimary: '#DF3500',
      colourSecondary: '#F56539',
      colourTertiary: '#A12600',
      hat: '',
    },
    procedure_blocks: {
      colourPrimary: '#2B882F',
      colourSecondary: '#41B245',
      colourTertiary: '#1F6222',
      hat: '',
    },
    colour_blocks: {
      colourPrimary: '#EB004F',
      colourSecondary: '#F54983',
      colourTertiary: '#AA0039',
      hat: '',
    },
  };

  const categoryStyles = {
    pinned_category: { colour: '#8F6500' },
    events_category: { colour: '#967100' },
    drive_category: { colour: '#0076DF' },
    motor_category: { colour: '#8A5DDA' },
    servo_category: { colour: '#AC6600' },
    sensor_category: { colour: '#2A882E' },
    board_category: { colour: '#957100' },
    logic_category: { colour: '#166DFF' },
    loop_category: { colour: '#24847B' },
    math_category: { colour: '#EE0505' },
    text_category: { colour: '#BC38D3' },
    list_category: { colour: '#0077D8' },
    variable_category: { colour: '#DF3500' },
    procedure_category: { colour: '#2B882F' },
    colour_category: { colour: '#EB004F' },
  };

  const componentStyles = {
    workspaceBackgroundColour: '#1E2028',
    toolboxBackgroundColour: '#242733',
    toolboxForegroundColour: '#E6E9F2',
    flyoutBackgroundColour: '#2A2E3B',
    flyoutForegroundColour: '#E6E9F2',
    flyoutOpacity: 0.98,
    scrollbarColour: '#4A5062',
    scrollbarOpacity: 0.7,
    insertionMarkerColour: '#8C86FF',
    insertionMarkerOpacity: 0.5,
    markerColour: '#8C86FF',
    cursorColour: '#8C86FF',
    selectedGlowColour: '#8C86FF',
    selectedGlowOpacity: 0.35,
    replacementGlowColour: '#8C86FF',
    replacementGlowOpacity: 0.35,
  };

  const fontStyle = {
    family: "'Nunito', 'Segoe UI', system-ui, sans-serif",
    weight: '700',
    size: 12,
  };

  mergeExtra(blockStyles, categoryStyles, extra);

  return Blockly.Theme.defineTheme('xrp_dark', {
    name: 'xrp_dark',
    blockStyles,
    categoryStyles,
    componentStyles,
    fontStyle,
    startHats: true,
  });
}


/**
 * Fold device-library styles into a palette. Existing names win, so a library
 * with a clashing style name cannot repaint a built-in category.
 *
 * @param {!Object} blockStyles - modified in place
 * @param {!Object} categoryStyles - modified in place
 * @param {?{blockStyles: Object, categoryStyles: Object}} extra
 */
function mergeExtra(blockStyles, categoryStyles, extra) {
  if (!extra) return;
  for (const [name, style] of Object.entries(extra.blockStyles || {})) {
    if (!(name in blockStyles)) blockStyles[name] = style;
  }
  for (const [name, style] of Object.entries(extra.categoryStyles || {})) {
    if (!(name in categoryStyles)) categoryStyles[name] = style;
  }
}
