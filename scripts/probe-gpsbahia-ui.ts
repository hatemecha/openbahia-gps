import { captureOfficialGpsBahia, probeArgs, relevantTrackRequests } from './gpsbahia-official.ts';

async function main(): Promise<void> {
  const { line, headed } = probeArgs();
  console.log(`Probing GPSBahia UI for line ${line} (headed=${headed})`);
  const capture = await captureOfficialGpsBahia(line, headed);
  console.log(`OFFICIAL BUS MARKERS: ${capture.officialBusMarkers.length}`);
  console.log(`FREQUENCY MARKERS OFF: ${capture.frequencyMarkersOff.length}`);
  console.log(`FREQUENCY MARKERS ON: ${capture.frequencyMarkersOn.length}`);
  console.log(`STOP MARKERS: ${capture.stopMarkers.length}`);
  console.log(`LINE OPTION VALUE: ${capture.lineIdentity?.optionValue ?? '—'}`);
  console.log(`SCREENSHOT: ${capture.screenshotPath}`);
  console.log(`JS FINDINGS: ${capture.jsFindingsPath}`);
  console.log('RELEVANT XHR/FETCH:');
  for (const item of relevantTrackRequests(capture)) {
    console.log(`  ${item.method} ${item.status} ${item.url}`);
  }
  console.log('BUS MARKERS:');
  for (const marker of capture.officialBusMarkers) {
    const nearest = capture.correlation.find((row) => row.marker.markerId === marker.markerId)?.nearest;
    console.log(
      `  ${marker.interno ?? marker.markerId} ${marker.lat},${marker.lng} nearestΔ=${nearest ? `${nearest.deltaM.toFixed(1)}m ${nearest.url}` : 'none'}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
