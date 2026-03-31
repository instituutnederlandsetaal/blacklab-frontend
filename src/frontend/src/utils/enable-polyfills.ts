// Useful for customjs scripts.
// NOTE: we will probably remove jquery when we port to vue 3.
import _$ from 'jquery';
(window as any).jquery = (window as any).$ = _$;
