export function formatDuration(durationMinutes) {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return `${hours}\u00a0h\u00a0${minutes}\u00a0min`;
}
