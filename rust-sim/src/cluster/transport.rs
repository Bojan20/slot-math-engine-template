//! Transport abstraction — abstract over how envelopes flow between
//! coordinator and worker. The real TCP transport lands in Faza 9.8b
//! (acceptance gate: 4× M3 Ultra → 1T in <15s). For now we ship the
//! interface + an in-memory channel implementation that drives the
//! full protocol end-to-end inside a single process. That's enough to
//! validate the coordinator/worker semantics and stand up acceptance
//! tests; swapping to `tokio::net::TcpStream` later is a localized
//! change inside this file.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use super::protocol::ClusterEnvelope;

pub trait ClusterTransport: Send + Sync {
    fn send(&self, envelope: &ClusterEnvelope) -> Result<(), String>;
    fn recv(&self) -> Result<Option<ClusterEnvelope>, String>;
}

/// In-process channel for tests + dev. Each side gets a clone that
/// shares the same VecDeque pair (one inbound, one outbound).
#[derive(Clone)]
pub struct InMemoryTransport {
    inbound: Arc<Mutex<VecDeque<ClusterEnvelope>>>,
    outbound: Arc<Mutex<VecDeque<ClusterEnvelope>>>,
}

impl InMemoryTransport {
    pub fn pair() -> (Self, Self) {
        let a = Arc::new(Mutex::new(VecDeque::new()));
        let b = Arc::new(Mutex::new(VecDeque::new()));
        let side_a = Self {
            inbound: a.clone(),
            outbound: b.clone(),
        };
        let side_b = Self {
            inbound: b,
            outbound: a,
        };
        (side_a, side_b)
    }
}

impl ClusterTransport for InMemoryTransport {
    fn send(&self, envelope: &ClusterEnvelope) -> Result<(), String> {
        self.outbound
            .lock()
            .map_err(|e| format!("InMemoryTransport: lock poisoned: {e}"))?
            .push_back(envelope.clone());
        Ok(())
    }
    fn recv(&self) -> Result<Option<ClusterEnvelope>, String> {
        Ok(self
            .inbound
            .lock()
            .map_err(|e| format!("InMemoryTransport: lock poisoned: {e}"))?
            .pop_front())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cluster::protocol::{WorkerHello, CLUSTER_PROTOCOL_VERSION};

    #[test]
    fn in_memory_transport_delivers_envelopes_both_ways() {
        let (a, b) = InMemoryTransport::pair();
        let hello = ClusterEnvelope::Hello(WorkerHello {
            protocol_version: CLUSTER_PROTOCOL_VERSION.into(),
            worker_id: "w".into(),
            benchmark_spins_per_sec: 1.0e9,
            hardware_notes: "M3".into(),
        });
        a.send(&hello).unwrap();
        // Side a → b inbound, b → a inbound.
        assert_eq!(b.recv().unwrap(), Some(hello.clone()));
        // No data: returns None, not an error.
        assert_eq!(b.recv().unwrap(), None);

        let abort = ClusterEnvelope::Abort { reason: "x".into() };
        b.send(&abort).unwrap();
        assert_eq!(a.recv().unwrap(), Some(abort));
    }

    #[test]
    fn fifo_order_preserved() {
        let (a, b) = InMemoryTransport::pair();
        for i in 0..5 {
            a.send(&ClusterEnvelope::Abort {
                reason: format!("{i}"),
            })
            .unwrap();
        }
        for i in 0..5 {
            match b.recv().unwrap() {
                Some(ClusterEnvelope::Abort { reason }) => assert_eq!(reason, format!("{i}")),
                other => panic!("expected Abort, got {other:?}"),
            }
        }
    }
}
