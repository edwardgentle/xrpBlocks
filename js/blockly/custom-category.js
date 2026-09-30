/**
 * Custom Category class to apply the category color to the background 
 * rather than just the left border.
 */
export class CustomCategory extends Blockly.ToolboxCategory {
  /**
   * @override
   */
  addColourBorder_(colour) {
    this.colour_ = colour; // Store the category color
    if (colour && this.iconDom_) {
      // Set the background color of the icon element permanently
      this.iconDom_.style.backgroundColor = colour;
    }
  }

  /**
   * @override
   */
  setSelected(isSelected) {
    super.setSelected(isSelected);
    if (this.rowDiv_) {
      if (isSelected && this.colour_) {
        this.rowDiv_.style.backgroundColor = this.colour_;
      } else {
        this.rowDiv_.style.backgroundColor = 'transparent';
      }
    }
  }
}

/**
 * Registers the custom category so Blockly uses it for all categories.
 */
export function registerCustomCategory() {
  Blockly.registry.register(
    Blockly.registry.Type.TOOLBOX_ITEM,
    Blockly.ToolboxCategory.registrationName,
    CustomCategory,
    true
  );
}
