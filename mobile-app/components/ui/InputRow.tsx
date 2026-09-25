/**
 * A padded row around a TextInput — a search box with its icon, an amount field
 * with its currency glyph — where a tap anywhere in the row focuses the input.
 *
 * The input inside such a row only covers its own text line, so taps on the
 * icon, the padding or the space above and below it used to do nothing. Same
 * fix as TextField's box, for rows that do not use TextField.
 * `accessible={false}` keeps the input, not this wrapper, the element a screen
 * reader announces.
 */

import React from "react";
import { Pressable, type StyleProp, type TextInput, type ViewStyle } from "react-native";

export default function InputRow({
  inputRef,
  style,
  children,
}: {
  inputRef: React.RefObject<TextInput | null>;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Pressable onPress={() => inputRef.current?.focus()} accessible={false} style={style}>
      {children}
    </Pressable>
  );
}
