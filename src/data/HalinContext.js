import nd from '../neo4jDesktop/index';
import ClusterNode from '../data/ClusterNode';
import _ from 'lodash';
import Promise from 'bluebird';
import uuid from 'uuid';
import moment from 'moment';
import appPkg from '../package.json';

const neo4j = require('neo4j-driver/lib/browser/neo4j-web.min.js').v1;

export default class HalinContext {
    domain = 'halin';

    constructor() {
        this.project = null;
        this.graph = null;
        this.drivers = {};
    }

    /**
     * Create a new driver for a given address.
     */
    driverFor(addr, username=_.get(this.base, 'username'), password=_.get(this.base, 'password')) {
        if (this.drivers[addr]) {
            return this.drivers[addr];
        }

        const driver = neo4j.driver(addr, neo4j.auth.basic(username, password), {
            encrypted: true,
        });
        this.drivers[addr] = driver;
        return driver;
    }

    shutdown() {
        console.log('Shutting down halin context');
        Object.values(this.drivers).map(driver => driver.close());
    }

    isCluster() {
        // Must have more than one node
        return this.clusterNodes && this.clusterNodes.length > 1;
    }

    checkForCluster(activeDb) {
        const session = this.base.driver.session();
        console.log('activeDb', activeDb);
        return session.run('CALL dbms.cluster.overview()', {})
            .then(results => {
                this.clusterNodes = results.records.map(rec => new ClusterNode(rec))

                this.clusterNodes.forEach(node => {
                    console.log(node.getAddress());
                });
            })
            .catch(err => {
                const str = `${err}`;
                if (str.indexOf('no procedure') > -1) {
                    // Halin will look at single node databases
                    // running in desktop as clusters of size 1.
                    const rec = {
                        id: uuid.v4(),
                        addresses: nd.getAddressesForGraph(activeDb.graph),
                        role: 'SINGLE',
                        database: 'default',
                    };

                    // Psuedo object behaves like a cypher result record.
                    // Somewhere, a strong typing enthusiast is screaming. ;)
                    const get = key => rec[key];
                    rec.get = get;

                    this.clusterNodes = [new ClusterNode(rec)];
                } else {
                    throw err;
                }
            })
            .finally(() => session.close());
    }

    /**
     * Returns a promise that resolves to the HalinContext object completed,
     * or rejects.
     */
    initialize() {
        try {
            return nd.getFirstActive()
                .then(active => {
                    this.project = active.project;
                    this.graph = active.graph;

                    this.base = _.cloneDeep(active.graph.connection.configuration.protocols.bolt);

                    // Create a default driver to have around.
                    const uri = `bolt://${this.base.host}:${this.base.port}`;
                    this.base.driver = this.driverFor(uri);

                    console.log('HalinContext created', this);
                    return this.checkForCluster(active);
                })
                .then(() => this)
        } catch (e) {
            return Promise.reject(new Error('General Halin Context error', e));
        }
    }

    // CSV lib doesn't escape double quotes properly so we have to do it manually
    // in our json.  CSV is dark evil magic, you don't want to know, other than
    // just this: escape " with "" (not \\") to appease the CSV gods.
    csvize = val => val;
        // JSON.stringify(val).replace(/\\([\s\S])|(")/g,"\"$1$2");

    _nodeDiagnostics(clusterNode) {
        const node = clusterNode.getAddress();
        const mkEntry = (domain, key, value) =>
            _.merge({ node }, { domain, key, value });

        const basics = [
            mkEntry(this.domain, 'protocols', clusterNode.protocols()),
            mkEntry(this.domain, 'role', clusterNode.role),
            mkEntry(this.domain, 'database', clusterNode.database),
            mkEntry(this.domain, 'id', clusterNode.id),
        ];

        const session = this.driverFor(clusterNode.getBoltAddress()).session();

        // Query must return 'value'
        const noFailCheck = (domain, query, key) =>
            session.run(query, {})
                .then(results => results.records[0])
                .then(record => record.get('value'))
                .catch(err => this.csvize(err))  // Convert errors into the value.
                .then(value => mkEntry(domain, key, value));

        // Format all JMX data into records.
        const genJMX = session.run("CALL dbms.queryJmx('*:*')", {})
            .then(results => 
                results.records.map(rec =>
                    mkEntry('jmx', rec.get('name'), this.csvize(rec.get('attributes')))));

        // Format node config into records.
        const genConfig = session.run('CALL dbms.listConfig()', {})
            .then(results =>
                results.records.map(rec => 
                    mkEntry('config', rec.get('name'), rec.get('value'))))

        const constraints = session.run('CALL db.constraints()', {})
            .then(results =>
                results.records.map((rec, idx) => 
                    mkEntry('constraint', idx, rec.get('description'))));

        const indexes = session.run('CALL db.indexes()', {})
            .then(results =>
                results.records.map((rec, idx) =>
                    mkEntry('index', idx, this.csvize({
                        description: rec.get('description'),
                        label: rec.get('label'),
                        properties: rec.get('properties'),
                        state: rec.get('state'),
                        type: rec.get('type'),
                        provider: rec.get('provider'),
                    }))));

        const otherPromises = [
            noFailCheck('algo', 'RETURN algo.version() as value', 'version'),
            noFailCheck('apoc', 'RETURN apoc.version() as value', 'version'),
            noFailCheck('nodes', 'MATCH (n) RETURN count(n) as value', 'count'),
            noFailCheck('schema', 'call db.labels() yield label return collect(label) as value', 'labels'),
        ];

        return Promise.all([indexes, constraints, genJMX, genConfig, ...otherPromises])
            .then(arrayOfArrays => _.flatten(arrayOfArrays))
            .then(results => results.concat(basics))
            .finally(() => session.close());
    }

    _halinDiagnostics() {
        const mkEntry = (key, value) => 
            _.merge({ domain: 'halin', node: 'n/a' }, { key, value });

        const halinDrivers = Object.keys(this.drivers).map(uri => ({
            domain: `${this.domain}-driver`,
            node: uri, 
            key: 'encrypted',
            value: _.get(this.drivers[uri]._config, 'encrypted'),
        }));

        return Promise.resolve([
            mkEntry('diagnosticsGenerated', moment.utc().toISOString()),
            mkEntry('halinVersion', appPkg.version),
        ].concat(halinDrivers));
    }

    runDiagnostics() {
        const halinDiagPromises = this._halinDiagnostics();
        const promises = this.clusterNodes.map(clusterNode => this._nodeDiagnostics(clusterNode));
        promises.push(halinDiagPromises);

        return Promise.all(promises)
            .then(arrayOfArrays => _.flatten(arrayOfArrays))
            .then(arr => _.sortBy(arr, 'domain'));
    }
}