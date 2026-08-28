import * as Highcharts from 'highcharts';

export function chartColors(baseColor: string | undefined, count: number): string[] {
	const numColors = Math.min(20, count);
	return Array.from(
		{ length: numColors },
		(_, i) =>
			Highcharts.color(baseColor as Highcharts.ColorType)
				.brighten(-0.4 + i / ((numColors + 1) * 0.7))
				.get() as string,
	);
}
