import { getAllNodes } from '@/features/form/model/form-utils';
import { isFormOutputName, isValidEmission, type FormEmission, type FormIssue, type FormOutputName, type RawEmission } from '@/features/form/model/types/form-output';
import type { FormBoundaryNode } from '@/features/form/model/types/form-shape';

export * from './gather';

export function diagnoseTargetOutputs(form: FormBoundaryNode, acceptedOutputs: readonly FormOutputName[], issues: FormIssue[]): void {
	const accepted = new Set(acceptedOutputs);
	for (const field of getAllNodes(form, 'field')) {
		for (const output of new Set(field.controller.outputs)) {
			if (accepted.has(output)) continue;
			issues.push({
				stage: 'accept',
				code: 'unsupported-output',
				nodeId: field.id,
				output,
				message: `Controller for '${field.id}' declares output '${output}', which the form target does not accept.`,
			});
		}
	}
}

export function acceptTargetEmissions<Names extends readonly FormOutputName[]>(emissions: readonly RawEmission[], acceptedOutputs: Names, issues: FormIssue[]): FormEmission<Names[number]>[] {
	const accepted = new Set<FormOutputName>(acceptedOutputs);
	const result: FormEmission<Names[number]>[] = [];
	for (const emission of emissions) {
		if (!isFormOutputName(emission.name)) continue;
		if (!accepted.has(emission.name)) {
			issues.push({
				stage: 'accept',
				code: 'unsupported-output',
				output: emission.name,
				message: `The form target does not accept output '${emission.name}'.`,
			});
			continue;
		}
		if (emission.value === undefined) continue;
		if (!isValidEmission(emission)) {
			issues.push({
				stage: 'accept',
				code: 'malformed-output',
				output: emission.name,
				message: `Ignoring malformed output '${emission.name}'.`,
			});
			continue;
		}
		result.push(emission as FormEmission<Names[number]>);
	}
	return result;
}
