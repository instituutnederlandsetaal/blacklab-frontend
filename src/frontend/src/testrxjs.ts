import { interval, take } from 'rxjs';
import { switchMap, map, delay, mergeMap } from 'rxjs/operators';
import { of } from 'rxjs';

const source$ = interval(10).pipe(
	take(5),
	switchMap(v =>
		of({v, l: v + ' switched'})


	),
	mergeMap(v => {
		const delayBy = v.v * 10;
		return of(v.l + ' delayed by ' + delayBy).pipe(delay(delayBy));
	})
);

source$.subscribe({
	next: (value) => console.log(`Event ${value + 1} fired`),
	complete: () => console.log('All events fired')
});