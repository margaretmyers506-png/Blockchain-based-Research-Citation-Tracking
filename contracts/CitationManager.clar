(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-PAPER-ID u101)
(define-constant ERR-PAPER-NOT-FOUND u102)
(define-constant ERR-CITATION-ALREADY-EXISTS u103)
(define-constant ERR-INVALID-CITATION-WEIGHT u104)
(define-constant ERR-INVALID-TIMESTAMP u105)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u106)
(define-constant ERR-INVALID-METADATA u107)
(define-constant ERR-CITATION-LIMIT-EXCEEDED u108)
(define-constant ERR-INVALID-CITER u109)
(define-constant ERR-SELF-CITATION u110)
(define-constant ERR-INVALID-REWARD u111)

(define-data-var citation-counter uint u0)
(define-data-var max-citations-per-paper uint u1000)
(define-data-var authority-contract (optional principal) none)
(define-data-var citation-reward-base uint u100)

(define-map citations
  { citation-id: uint }
  { citer-id: uint, cited-id: uint, weight: uint, timestamp: uint, citer-principal: principal }
)

(define-map paper-citation-count
  { paper-id: uint }
  { count: uint }
)

(define-map citation-rewards
  { paper-id: uint }
  { total-reward: uint }
)

(define-read-only (get-citation (citation-id uint))
  (map-get? citations { citation-id: citation-id })
)

(define-read-only (get-citation-count (paper-id uint))
  (default-to { count: u0 } (map-get? paper-citation-count { paper-id: paper-id }))
)

(define-read-only (get-citation-reward (paper-id uint))
  (default-to { total-reward: u0 } (map-get? citation-rewards { paper-id: paper-id }))
)

(define-private (validate-paper-id (paper-id uint))
  (if (> paper-id u0)
      (ok true)
      (err ERR-INVALID-PAPER-ID))
)

(define-private (validate-citation-weight (weight uint))
  (if (and (> weight u0) (<= weight u100))
      (ok true)
      (err ERR-INVALID-CITATION-WEIGHT))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-citations (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-CITATION-WEIGHT))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-citations-per-paper new-max)
    (ok true)
  )
)

(define-public (set-citation-reward-base (new-reward uint))
  (begin
    (asserts! (> new-reward u0) (err ERR-INVALID-REWARD))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set citation-reward-base new-reward)
    (ok true)
  )
)

(define-public (add-citation (citer-id uint) (cited-id uint) (weight uint))
  (let
    (
      (citation-id (var-get citation-counter))
      (current-count (get count (get-citation-count cited-id)))
      (authority (var-get authority-contract))
    )
    (asserts! (is-some authority) (err ERR-AUTHORITY-NOT-VERIFIED))
    (try! (validate-paper-id citer-id))
    (try! (validate-paper-id cited-id))
    (asserts! (not (is-eq citer-id cited-id)) (err ERR-SELF-CITATION))
    (try! (validate-citation-weight weight))
    (try! (validate-timestamp block-height))
    (asserts! (< current-count (var-get max-citations-per-paper)) (err ERR-CITATION-LIMIT-EXCEEDED))
    (asserts! (is-none (map-get? citations { citation-id: citation-id })) (err ERR-CITATION-ALREADY-EXISTS))
    (map-set citations
      { citation-id: citation-id }
      { citer-id: citer-id, cited-id: cited-id, weight: weight, timestamp: block-height, citer-principal: tx-sender }
    )
    (map-set paper-citation-count
      { paper-id: cited-id }
      { count: (+ current-count u1) }
    )
    (let
      (
        (current-reward (get total-reward (get-citation-reward cited-id)))
        (new-reward (* weight (var-get citation-reward-base)))
      )
      (map-set citation-rewards
        { paper-id: cited-id }
        { total-reward: (+ current-reward new-reward) }
      )
    )
    (var-set citation-counter (+ citation-id u1))
    (print { event: "citation-added", id: citation-id, citer: citer-id, cited: cited-id })
    (ok citation-id)
  )
)

(define-public (remove-citation (citation-id uint))
  (let
    (
      (citation (map-get? citations { citation-id: citation-id }))
    )
    (match citation
      cit
        (begin
          (asserts! (is-eq (get citer-principal cit) tx-sender) (err ERR-NOT-AUTHORIZED))
          (let
            (
              (cited-id (get cited-id cit))
              (current-count (get count (get-citation-count cited-id)))
              (current-reward (get total-reward (get-citation-reward cited-id)))
              (citation-weight (get weight cit))
            )
            (map-set paper-citation-count
              { paper-id: cited-id }
              { count: (- current-count u1) }
            )
            (map-set citation-rewards
              { paper-id: cited-id }
              { total-reward: (- current-reward (* citation-weight (var-get citation-reward-base))) }
            )
            (map-delete citations { citation-id: citation-id })
            (print { event: "citation-removed", id: citation-id })
            (ok true)
          )
        )
      (err ERR-CITATION-ALREADY-EXISTS)
    )
  )
)

(define-read-only (get-total-citations)
  (ok (var-get citation-counter))
)