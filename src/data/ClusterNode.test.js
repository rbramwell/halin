import ClusterNode from './ClusterNode';
import fakes from '../testutils/fakes';
import Ring from 'ringjs';

describe('ClusterNode', function () {
    const host = 'foo-host';
    const boltAddress = `bolt://${host}:7777`;
    const httpAddress = `http://${host}:8888`;
    const entry = {
        id: 'XYZ',
        addresses: [httpAddress, boltAddress],
        role: 'LEADER',
        database: 'ABC',        
    };
    const fakeRecord = fakes.record(entry);
    let c;

    beforeEach(() => {
        c = new ClusterNode(fakeRecord);
    });

    it('can be constructed', () => {
        expect(c.id).toEqual(entry.id);
        expect(c.addresses).toEqual(entry.addresses);
        expect(c.role).toEqual(entry.role);
        expect(c.database).toEqual(entry.database);
    });

    it('exposes getObservations', () => {
        const obs = c.getObservations();
        expect(obs).toBeInstanceOf(Ring);
    });

    it('knows its bolt address', () => expect(c.getBoltAddress()).toEqual(boltAddress));
    it('knows how to label by host', () => expect(c.getLabel()).toEqual(host));
    it('knows how to extract protocols', () => {
        const prots = c.protocols();
        expect(prots).toContain('http');
        expect(prots).toContain('bolt');
    });
    
});