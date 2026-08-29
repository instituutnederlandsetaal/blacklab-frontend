import { createExploreAnnotationController, type ExploreAnnotationControllerConfig } from './explore-annotation-controller';

export type NgramGroupAnnotationControllerConfig = ExploreAnnotationControllerConfig;

/** N-gram grouping selector. The state remains an annotation id; only the result preset receives the `hit:` prefix. */
export const ngramGroupAnnotationController = createExploreAnnotationController<'explore-ngram-group-annotation', NgramGroupAnnotationControllerConfig>(
	'explore-ngram-group-annotation',
	'n-gram grouping',
	false,
);
