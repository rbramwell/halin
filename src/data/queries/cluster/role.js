import HalinQuery from '../HalinQuery';

export default new HalinQuery({
    dependency: {
        type: 'deploy',
        name: 'cluster',
    },
    query: 'CALL dbms.cluster.role() YIELD role RETURN role',
    columns: [
        { Header: 'Role', accessor: 'role' },
    ],
    rate: 5000,
});