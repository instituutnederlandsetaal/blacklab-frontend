import { createExploreAnnotationController, type ExploreAnnotationControllerConfig } from './explore-annotation-controller';

export type FrequencyAnnotationControllerConfig = ExploreAnnotationControllerConfig;
export const frequencyAnnotationController = createExploreAnnotationController<'explore-frequency-annotation', FrequencyAnnotationControllerConfig>('explore-frequency-annotation', 'frequency', true);
