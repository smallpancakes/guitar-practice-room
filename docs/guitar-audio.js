// Nearby recorded pitches retain the guitar's attack and decay across the neck.
const samples = [[40, 'E2'], [45, 'A2'], [50, 'D3'], [55, 'G3'], [59, 'B3'], [64, 'E4'], [69, 'A4'], [74, 'D5']];
const buffers = new Map();
export function guitarSample(midi) {
  const [root, name] = samples.reduce((best, item) => Math.abs(item[0] - midi) < Math.abs(best[0] - midi) ? item : best);
  return { url: new URL(`./assets/guitar/${name}.mp3`, import.meta.url).href, rate: 2 ** ((midi - root) / 12) };
}
export async function guitarBuffer(context, url) {
  if (!buffers.has(url)) {
    const pending = fetch(url).then(response => {
      if (!response.ok) throw new Error('Guitar sample unavailable');
      return response.arrayBuffer();
    }).then(data => context.decodeAudioData(data));
    buffers.set(url, pending);
    pending.catch(() => { if (buffers.get(url) === pending) buffers.delete(url); });
  }
  return buffers.get(url);
}
