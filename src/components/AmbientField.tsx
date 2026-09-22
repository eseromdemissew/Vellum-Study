/** The drifting gradient field every glass surface floats over. */
export function AmbientField() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="blob anim-drift size-[520px] bg-primary/40 -top-40 -left-24" />
      <div className="blob anim-drift2 size-[460px] bg-cool/40 top-1/3 -right-24" />
      <div className="blob anim-drift-slow size-[380px] bg-primary/25 bottom-0 left-1/3" />
      <div className="ambient-veil absolute inset-0" />
    </div>
  );
}
