import { userName as userNamePromise, user as userPromise } from '@/_new/shared/auth/loginsystem';
import router from '@/navigation/router';
import type { User } from 'oidc-client-ts';
import { computed, ref } from 'vue';

export const indexId = computed(() => router.currentRoute.value.params.corpus as string | undefined);
export const docId = computed(() => router.currentRoute.value.params.docId as string | undefined);
export const user = ref<User|null>(null);
export const userName = ref<string|null>(null);

void userPromise.then(u => user.value = u);
void userNamePromise.then(u => userName.value = u);