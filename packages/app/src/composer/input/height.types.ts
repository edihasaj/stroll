import type { TextStyle } from "react-native";

export type ComposerHeightResult =
  | {
      mode: "intrinsic";
      style: TextStyle;
      /** Native has nothing to ease — `TextInput` grows itself. Present (as `undefined`) only
       * so callers can destructure `wrapperStyle` off either branch without optional chaining. */
      wrapperStyle?: undefined;
      scrollEnabled: true;
    }
  | {
      mode: "measured";
      style: TextStyle;
      /** Card-growth easing (web only): the same target height as `style`, but on a wrapper
       * that eases via CSS transition while the textarea itself (`style`) snaps instantly so
       * the caret never lags. See `height.web.ts`. */
      wrapperStyle?: TextStyle;
      scrollEnabled: boolean;
      onTextChange: (previousText: string, nextText: string) => void;
      reset: () => void;
    };
