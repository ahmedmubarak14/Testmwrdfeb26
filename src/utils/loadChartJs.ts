const CHART_JS_SCRIPT_ID = 'chartjs-cdn-script';
const CHART_JS_CDN_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js';

type ChartCtor = new (
  item: HTMLCanvasElement | CanvasRenderingContext2D,
  config: Record<string, unknown>
) => { destroy: () => void };

declare global {
  interface Window {
    Chart?: ChartCtor;
  }
}

let chartLoadPromise: Promise<ChartCtor> | null = null;

function resolveChartConstructor(): ChartCtor {
  if (!window.Chart) {
    throw new Error('Chart.js script loaded but Chart constructor is unavailable');
  }

  return window.Chart;
}

export function loadChartJs(): Promise<ChartCtor> {
  if (window.Chart) {
    return Promise.resolve(window.Chart);
  }

  if (chartLoadPromise) {
    return chartLoadPromise;
  }

  chartLoadPromise = new Promise<ChartCtor>((resolve, reject) => {
    const existingScript = document.getElementById(CHART_JS_SCRIPT_ID) as HTMLScriptElement | null;

    if (existingScript) {
      existingScript.addEventListener('load', () => {
        try {
          resolve(resolveChartConstructor());
        } catch (error) {
          reject(error);
        }
      }, { once: true });
      existingScript.addEventListener('error', () => {
        reject(new Error('Failed to load Chart.js script'));
      }, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = CHART_JS_SCRIPT_ID;
    script.src = CHART_JS_CDN_URL;
    script.async = true;
    script.onload = () => {
      try {
        resolve(resolveChartConstructor());
      } catch (error) {
        reject(error);
      }
    };
    script.onerror = () => reject(new Error('Failed to load Chart.js script'));
    document.head.appendChild(script);
  });

  return chartLoadPromise;
}
