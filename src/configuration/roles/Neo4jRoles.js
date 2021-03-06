import React, { Component } from 'react';
import CypherDataTable from '../../data/CypherDataTable';
import { Grid, Button, Confirm } from 'semantic-ui-react';
import status from '../../status/index';
import hoc from '../../higherOrderComponents';
import sentry from '../../sentry/index';
import './Neo4jRoles.css';

class Neo4jRoles extends Component {
    query = 'call dbms.security.listRoles()';
    static undeleteableRoles = [
        'admin', 'reader', 'architect', 'publisher', 'editor',
    ];

    static canDelete(role) {
        return Neo4jRoles.undeleteableRoles.indexOf(role) === -1;
    }

    displayColumns = [
        {
            Header: 'Delete',
            id: 'delete',
            minWidth: 70,
            maxWidth: 100,
            Cell: ({ row }) => (
                <Button compact negative
                    // Don't let people delete neo4j or admins for now.
                    disabled={!Neo4jRoles.canDelete(row.role)}
                    onClick={e => this.open(row)/*this.deleteUser(e, row)*/}
                    type='submit' icon="cancel"/>
            ),
        },
        { Header: 'Role', accessor: 'role' },
        {
            Header: 'Users',
            accessor: 'users',
            Cell: ({ row }) => row.users.map((user, idx) => (
                <div className='user' key={idx}>
                    {user}{idx < row.users.length - 1 ? ',' : ''}
                </div>
            )),
        },
    ];

    state = {
        childRefresh: 1,
        refresh: 1,
    }

    componentWillReceiveProps(props) {
        // If I receive a refresh signal, copy to child
        // which does data polling.  Man I wish there were a better way.
        const refresh = this.state.refresh;
        if (refresh !== props.refresh) {
            this.refresh(props.refresh);
        }
    }

    refresh(val = (this.state.refresh + 1)) {
        this.setState({
            refresh: val,
            childRefresh: val,
            message: null,
            error: null,
        });
    }

    deleteRole(row) {
        sentry.info('DELETE ROLE', row);

        const mgr = window.halinContext.getClusterManager();

        return mgr.deleteRole(row.role)
            .then(clusterOpRes => {
                sentry.fine('ClusterMgr result', clusterOpRes);
                const action = `Deleting role ${row.role}`;

                if (clusterOpRes.success) {
                    this.setState({
                        pending: false,
                        message: status.fromClusterOp(action, clusterOpRes),
                        error: null,
                    });
                } else {
                    this.setState({
                        pending: false,
                        message: null,
                        error: status.fromClusterOp(action, clusterOpRes),
                    });
                }
            })
            .catch(err => this.setState({
                pending: false,
                message: null,
                error: status.message('Error',
                    `Could not delete role ${row.role}: ${err}`),
            }));
    }

    open = (row) => {
        this.setState({
            confirmOpen: true,
            activeRole: row,
        });
    };

    confirm = () => {
        const roleToDelete = this.state.activeRole;
        this.setState({
            confirmOpen: false,
            activeRole: null,
            message: null,
            error: null,
        });

        return this.deleteRole(roleToDelete);
    }

    close = () => {
        this.setState({ confirmOpen: false });
    }

    render() {
        let message = status.formatStatusMessage(this);

        return (
            <div className="Neo4jRoles">
                <h3>Roles</h3>

                <Grid>
                    <Grid.Row columns={2}>
                        <Grid.Column>
                            {message || 'Browse, filter, and delete roles below'}
                        </Grid.Column>
                        <Grid.Column>
                            <Button basic onClick={e => this.refresh()} icon="refresh"/>
                        </Grid.Column>
                    </Grid.Row>

                    <Confirm
                        header='Delete Role'
                        content='Are you sure? This action cannot be undone.  If you delete this role, all users currently assigned to this role will lose it.'
                        open={this.state.confirmOpen}
                        onCancel={this.close}
                        onConfirm={this.confirm} />

                    <Grid.Row columns={1}>
                        <Grid.Column>
                            <CypherDataTable
                                node={this.props.node}
                                query={this.query}
                                showPagination={true}
                                refresh={this.state.childRefresh}
                                displayColumns={this.displayColumns}
                            />
                        </Grid.Column>
                    </Grid.Row>
                </Grid>
            </div>
        );
    }
}

export default hoc.enterpriseOnlyComponent(Neo4jRoles);