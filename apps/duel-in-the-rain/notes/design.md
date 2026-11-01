# Design notes

## Layout (metres, y up, +z toward the gate)
- Court: x −6…6, z −3.5…3.5, slabs in running bond. Duel centre z ≈ −0.5 so the gate never hides the fighters from the default camera.
- Hall: plinth x −6…6, z −11.5…−5.2, 0.9 m high; six pillars at z −5.6; roof ridge at z −8.3, y 6.6; eaves at y 4.1.
- Gate: z 4.7; nine steps down to a landing at y −2.43 where the waiting pair stands under umbrellas.
- Pond centre (10.1, −0.6); water pavilion (−9.6, 1.6); cedar (−9.8, −8.6); maple (9.4, −7.6); bamboo strip x 12.4…13.9.

## Palette
72 colours in 13 ramps (night blues, slate, earth, warm stone, vermilion, lantern amber, moss, maple, skin, indigo, pond teal, paper, cold light). Quantization is nearest-colour in OKLab with lightness weighted ×1.15.

## Swordwork
- Stances: middle, high, low, eight-sided, hidden side.
- Cuts: overhead, diagonal, rising, across the body, thrust, wrist; plus the draw-and-cut (iai swordsman Haru) and the parting cut out of a bind.
- Each cut is a keyframed path for the hilt position and blade direction in the swordsman's own frame, with a sliding step. The defender parries (blade-to-blade contact point gives the sparks), slips back, or is grazed (sleeve, sash or sleeve cord).
- When ki drops below 32 (or after 11 exchanges, or after the lightning button) the finale runs: step back, stand still, lightning, the pass, back to back, then one of three endings.
