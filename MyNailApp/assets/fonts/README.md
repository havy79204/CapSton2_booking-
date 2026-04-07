This folder is for custom font files used by the app (e.g. .ttf, .otf).

I could not find any font binary files in the `Nail Salon Management App (1)` project — the web project contains an empty `src/styles/fonts.css` and no .ttf/.otf files. If you have the font files you want to use (for example `Inter-Regular.ttf`, `Poppins-Bold.ttf`, etc.), please copy them here.

How to use after adding fonts:

1. Place the font files in this folder (example: `assets/fonts/Inter-Regular.ttf`).
2. Load them at app startup with `expo-font` (already a dependency). Example loader in `app/_layout.tsx` or a bootstrap component:

```js
import { useEffect, useState } from 'react';
import * as Font from 'expo-font';

export default function Bootstrap({ children }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    (async () => {
      await Font.loadAsync({
        'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
      });
      setReady(true);
    })();
  }, []);

  if (!ready) return null;
  return children;
}
```

3. Update styles to use the loaded font family names.

If you want, I can search for the exact font names used in the Nail Salon project and add them here — but I couldn't find font binaries in that repo. Upload the font files or tell me which font names you want and I will add them and wire the loader.
