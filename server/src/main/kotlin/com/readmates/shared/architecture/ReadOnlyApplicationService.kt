package com.readmates.shared.architecture

/**
 * CQRS read-side application service임을 명시.
 *
 * 이 annotation이 붙은 클래스는:
 *  - mutation port (`...Save...`, `...Update...`, `...Delete...`) 를 참조하지 않는다.
 *  - `@Transactional(readOnly = false)` 를 사용하지 않는다.
 *
 * 현재 read-side 패키지: note, publication, archive.
 * `feedback` 은 mixed (upload mutation 존재) — annotation 부착 금지.
 */
@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.RUNTIME)
annotation class ReadOnlyApplicationService
