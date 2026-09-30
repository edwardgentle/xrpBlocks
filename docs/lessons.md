# XRP Blocks — Lesson Format Specification

This document describes the JSON format used to author procedural tutorials for the XRP Blocks IDE.

## Overview

A lesson is a single `.json` file loaded into the IDE at runtime via the **📖 Lesson** button.
When loaded, the IDE:

1. Replaces the workspace with the lesson `template` (if provided)
2. Restricts the toolbox to the categories and blocks listed in `toolbox` (if provided)
3. Displays the first step of the lesson in a panel above the workspace
4. Lets the student navigate steps with **Previous** and **Next** buttons

## Top-Level Structure

```json
{
  "title":   "<string>",
  "steps":   ["<string>", ...],
  "toolbox": { ... },
  "template": { ... }
}
```

| Key | Type | Required | Description |
|---|---|---|---|
| `title` | string | ✅ Yes | Shown in the lesson panel header. Authored in any language — not translated by the IDE. |
| `steps` | string[] | ✅ Yes | One string per step. Rendered as HTML so `<b>`, `<i>`, `<code>` etc. are supported. |
| `toolbox` | object | ❌ No | Restricts which categories and blocks appear. If omitted or `{}`, all categories are shown. |
| `template` | object | ❌ No | Blockly workspace serialization. Loaded into the workspace when the lesson starts. |

> [!NOTE]
> **Content is never translated by the IDE.** The `title` and `steps` are authored directly in the target language.

## `steps` — Step Content

Each step is a string that may contain inline HTML for formatting:

```json
"steps": [
  "Welkom! Sleep het blok <b>rij rechtdoor</b> in het Start-blok.",
  "Verander de afstand naar <code>30</code> cm.",
  "🎉 Geweldig! Druk op <b>Start</b> om de robot te laten rijden."
]
```

**Supported HTML tags:** `<b>`, `<i>`, `<em>`, `<strong>`, `<code>`, `<br>`, `<span>`.

**Conventions:**
- Use `<b>` for block names and UI element names
- Use `<code>` for literal values (numbers, code snippets)
- Use `<i>` for positional hints (e.g. *in* the loop, *after* the block)
- Use an emoji at the start of the final step as a completion signal (e.g. 🎉)

## `toolbox` — Toolbox Filtering

The `toolbox` object restricts which categories and blocks appear in the side panel.

### Behaviour rules

| `toolbox` value | Result |
|---|---|
| Key omitted entirely, or `{}` | All categories shown, all blocks shown |
| Category key present, value is `[]` | That category is shown with **all** its blocks |
| Category key present, value is `["block_type", ...]` | That category is shown with **only** the listed blocks |
| Category key absent | That category is **hidden** |

### Category keys

Use the stable English category keys below (independent of the UI language):

| Key | Contents |
|---|---|
| `"Events"` | `xrp_start` |
| `"Drive"` | Drivetrain movement blocks |
| `"Motors"` | Individual motor control |
| `"Servo"` | Servo positioning |
| `"Sensors"` | Distance, line, IMU, button |
| `"Board"` | LED, RGB, wait, print |
| `"Logic"` | If/else, comparisons, boolean operators |
| `"Loops"` | Repeat, while, for |
| `"Math"` | Numbers, arithmetic, random |
| `"Text"` | Strings and text manipulation |
| `"Variables"` | Create and use variables |
| `"Functions"` | Define and call functions |

### Example

```json
"toolbox": {
  "Events": [],
  "Drive": ["xrp_drive_straight", "xrp_drive_stop"],
  "Board": ["xrp_wait_seconds"]
}
```

This shows three categories. `Events` shows all its blocks. `Drive` shows only two specific blocks. `Board` shows only `xrp_wait_seconds`. All other categories are hidden.


## `template` — Pre-built Workspace

The `template` value is a **Blockly workspace serialization object** — the same format produced by the IDE's **Save** button.

### Getting a template

The easiest way to create a template is to:
1. Build the desired starting state in the XRP Blocks IDE
2. Click **Save** — this downloads a `.json` file
3. Copy the entire downloaded JSON and paste it as the `"template"` value in your lesson

### Inline authoring

You can also write the template JSON by hand. The format follows the Blockly serialization schema:

```json
"template": {
  "blocks": {
    "languageVersion": 0,
    "blocks": [
      {
        "type": "xrp_start",
        "id": "unique_id",
        "x": 60,
        "y": 60,
        "next": {
          "block": { ... }
        }
      }
    ]
  }
}
```

> [!IMPORTANT]
> Every block `id` must be unique within the template. Use a consistent naming scheme such as `lesson_name_block_role` (e.g. `lesson2_drive1`, `lesson2_turn1`).

### Block serialization cheat sheet

#### Statement block (connects top-to-bottom)

```json
{
  "type": "xrp_drive_straight",
  "id": "my_drive",
  "inputs": {
    "DISTANCE": {
      "shadow": {
        "type": "math_number",
        "id": "my_dist",
        "fields": { "NUM": 30 }
      }
    }
  },
  "next": {
    "block": { ... }
  }
}
```

Use `"next"` to chain statement blocks. Use `"inputs"` for value sockets. Use `"shadow"` for default/editable values; use `"block"` (instead of `"shadow"`) for fixed, non-editable connections.

#### Repeat loop

```json
{
  "type": "controls_repeat_ext",
  "id": "my_loop",
  "inputs": {
    "TIMES": {
      "shadow": { "type": "math_number", "id": "my_n", "fields": { "NUM": 4 } }
    },
    "DO": {
      "block": { ... }
    }
  }
}
```

#### While loop

```json
{
  "type": "controls_whileUntil",
  "id": "my_while",
  "fields": { "MODE": "WHILE" },
  "inputs": {
    "BOOL": {
      "block": {
        "type": "logic_boolean",
        "id": "my_bool",
        "fields": { "BOOL": "TRUE" }
      }
    },
    "DO": {
      "block": { ... }
    }
  }
}
```

#### If statement

```json
{
  "type": "controls_if",
  "id": "my_if",
  "inputs": {
    "IF0": { "block": { ... } },
    "DO0": { "block": { ... } }
  }
}
```

#### Comparison (e.g. distance sensor > 20)

```json
{
  "type": "logic_compare",
  "id": "my_cmp",
  "fields": { "OP": "GT" },
  "inputs": {
    "A": { "block": { "type": "xrp_distance_sensor", "id": "my_sensor" } },
    "B": { "shadow": { "type": "math_number", "id": "my_val", "fields": { "NUM": 20 } } }
  }
}
```

**`OP` values:** `EQ` (=), `NEQ` (≠), `LT` (<), `LTE` (≤), `GT` (>), `GTE` (≥)

---

## Complete Block Reference

### Events
| Block type | Description |
|---|---|
| `xrp_start` | Program entry point — always required as the top-level block |

### Drive
| Block type | Description | Inputs |
|---|---|---|
| `xrp_drive_straight` | Drive straight N cm | `DISTANCE` |
| `xrp_drive_straight_effort` | Drive straight N cm at X% effort | `DISTANCE`, `EFFORT` |
| `xrp_drive_turn` | Turn N degrees | `ANGLE` |
| `xrp_drive_turn_effort` | Turn N degrees at X% effort | `ANGLE`, `EFFORT` |
| `xrp_drive_stop` | Stop immediately | — |
| `xrp_drive_set_effort` | Set motor effort directly (-1 to 1) | `LEFT`, `RIGHT` |
| `xrp_drive_set_speed` | Set motor speed | `LEFT`, `RIGHT` |
| `xrp_drive_arcade` | Arcade drive (speed + steering) | `SPEED`, `TURN` |
| `xrp_drive_get_left_encoder` | Read left wheel encoder (value block) | — |
| `xrp_drive_get_right_encoder` | Read right wheel encoder (value block) | — |
| `xrp_drive_reset_encoders` | Reset both encoders to zero | — |

### Motors
| Block type | Description | Inputs / Fields |
|---|---|---|
| `xrp_motor_set_effort` | Set motor effort | `EFFORT` |
| `xrp_motor_set_speed` | Set motor speed | `SPEED` |
| `xrp_motor_get_position` | Read encoder position (value block) | — |
| `xrp_motor_get_speed` | Read motor speed (value block) | — |
| `xrp_motor_reset_encoder` | Reset encoder to zero | — |
| `xrp_motor_brake` | Brake the motor | — |
| `xrp_motor_coast` | Coast (free-wheel) the motor | — |

### Servo
| Block type | Description | Inputs |
|---|---|---|
| `xrp_servo_set_angle` | Set servo angle 0–180° | `ANGLE` |
| `xrp_servo_free` | Release servo (disable hold) | — |

### Sensors
| Block type | Description |
|---|---|
| `xrp_distance_sensor` | Distance in cm (value block) |
| `xrp_line_get_left` | Left reflectance sensor 0–1 (value block) |
| `xrp_line_get_right` | Right reflectance sensor 0–1 (value block) |
| `xrp_imu_get_yaw` | Gyro yaw in degrees (value block) |
| `xrp_imu_get_pitch` | Gyro pitch in degrees (value block) |
| `xrp_imu_get_roll` | Gyro roll in degrees (value block) |
| `xrp_imu_calibrate` | Calibrate IMU (keep robot still) |
| `xrp_button_is_pressed` | True if button is pressed (value block) |
| `xrp_wait_for_button` | Wait until button is pressed |

### Board
| Block type | Description | Inputs |
|---|---|---|
| `xrp_led_on` | Turn green LED on | — |
| `xrp_led_off` | Turn green LED off | — |
| `xrp_led_blink` | Blink LED N times with delay | `COUNT`, `DELAY` |
| `xrp_rgb_led` | Set RGB LED color (0–255) | `RED`, `GREEN`, `BLUE` |
| `xrp_wait_seconds` | Pause for N seconds | `SECONDS` |
| `xrp_print` | Print value to console | `TEXT` |

### Logic (standard Blockly)
| Block type | Description |
|---|---|
| `controls_if` | If statement |
| `controls_ifelse` | If/else statement |
| `logic_compare` | Compare two values (fields: `OP`) |
| `logic_operation` | AND / OR (fields: `OP`: `AND`, `OR`) |
| `logic_negate` | NOT |
| `logic_boolean` | True / False literal (fields: `BOOL`: `TRUE`, `FALSE`) |

### Loops (standard Blockly)
| Block type | Description |
|---|---|
| `controls_repeat_ext` | Repeat N times (input: `TIMES`) |
| `controls_whileUntil` | While / Until loop (fields: `MODE`: `WHILE`, `UNTIL`) |
| `controls_for` | For loop with variable |
| `controls_forEach` | For each item in list |
| `controls_flow_statements` | Break / Continue (fields: `FLOW`: `BREAK`, `CONTINUE`) |

### Math (standard Blockly)
| Block type | Description |
|---|---|
| `math_number` | Number literal (fields: `NUM`) |
| `math_arithmetic` | +, -, ×, ÷, ^ (fields: `OP`: `ADD`, `MINUS`, `MULTIPLY`, `DIVIDE`, `POWER`) |
| `math_random_int` | Random integer between A and B |
| `math_constrain` | Clamp value between min and max |
| `math_round` | Round a number |
| `math_modulo` | Remainder (modulo) |

### Text (standard Blockly)
| Block type | Description |
|---|---|
| `text` | Text string literal (fields: `TEXT`) |
| `text_join` | Concatenate strings |

---

## Full Example

```json
{
  "title": "Les 1: Hallo Robot!",
  "steps": [
    "👋 Welkom! In deze les schrijf je je <b>eerste programma</b> voor de XRP robot.",
    "Klik op de categorie <b>Aandrijving</b> en sleep het blok <b>rij rechtdoor</b> in het Start-blok.",
    "Verander de afstand naar <code>30</code> cm.",
    "Sleep een <b>stop met rijden</b>-blok eronder.",
    "🎉 Verbind je robot en druk op <b>Start</b>!"
  ],
  "toolbox": {
    "Events": [],
    "Drive": ["xrp_drive_straight", "xrp_drive_stop"],
    "Board": ["xrp_wait_seconds"]
  },
  "template": {
    "blocks": {
      "languageVersion": 0,
      "blocks": [
        {
          "type": "xrp_start",
          "id": "les1_start",
          "x": 60,
          "y": 60
        }
      ]
    }
  }
}
```

## Tips for LLM-generated Lessons

- **Always include `xrp_start`** as the first block in `template.blocks.blocks`. The IDE will add it automatically if missing, but explicit placement gives control over position.
- **Use unique, descriptive IDs** for every block — `lesson_slug_role` (e.g. `les2_turn1`). Duplicate IDs cause silent load failures.
- **Match `toolbox` keys to template block types** — if a block type appears in the template, its category should appear in the toolbox so students can find similar blocks.
- **Chain statements with `"next"`**, nest body blocks with `"inputs": { "DO": { "block": ... } }`.
- **Shadow vs. block**: use `"shadow"` for editable default values (the student can change them), use `"block"` for fixed connected blocks (cannot be easily detached).
- **Validate the JSON** before saving — a syntax error silently prevents the lesson from loading.
- **Steps should reference visible block names**, not internal type names (write "rij rechtdoor" not "xrp_drive_straight").
- **Keep steps short** — one action or concept per step. Six to eight steps is a good target for a 10-minute lesson.
