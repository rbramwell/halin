import React, { Component } from 'react';
import CypherDataTable from '../data/CypherDataTable';
import Explainer from '../Explainer';
import queryLibrary from '../data/queries/query-library';
import { Message } from 'semantic-ui-react';
import hoc from '../higherOrderComponents';

class StorageCapacity extends Component {
    state = {
        // Slow way down, doesn't change moment to moment and places
        // load
        rate: 60000,
        query: queryLibrary.APOC_STORAGE_METRIC.query,
        displayColumns: queryLibrary.APOC_STORAGE_METRIC.columns,
    };

    help() {
        return (
            <div className='StorageCapacityHelp'>
                <p>Neo4j allows you to configure different directory locations.</p>
                <p>Often these will be on the same disk.</p>
                <p>The table below shows the underlying disk free and available 
                   in each directory specified in your neo4j.conf file.</p>
                <p>If many statistics are the same, this probably means that most 
                or all of your files reside on the same disk.</p>

                <p><a target="docs" href="https://neo4j.com/docs/operations-manual/current/reference/configuration-settings/#config_dbms.directories.data">
                    For more information, consult the configuration settings reference in the operations manual
                    </a>
                </p>
            </div>
        );
    }

    render() {
        return (
            <div className='StorageCapacity'>
                <h3>Storage Capacity <Explainer icon='info' content={this.help()}/></h3>
                <CypherDataTable 
                    node={this.props.node}
                    query={this.state.query}
                    allowColumnSelect={false}
                    displayColumns={this.state.displayColumns}
                    showPagination={false}
                    defaultPageSize={10}
                    sortable={true}
                    filterable={false}
                    rate={this.state.rate}/>
            </div>
        );
    }
}

const code = text => <span style={{fontFamily:'monospace'}}>{text}</span>;

const compatCheckFn = ctx =>
    Promise.resolve(
        ctx.supportsAPOC() && 
        ctx.supportsMetrics());

// What to tell the user if the compatibility checks aren't satisfied.
const notSupported = () => {
    return (
        <Message warning>
            <Message.Header>Additional Configuration Needed</Message.Header>
            <Message.Content>
                <p>In order to view metrics in Halin, some additional configuration of your Neo4j
                   instance is necessary.
                </p>

                <ul style={{textAlign: 'left'}}>
                    <li>Ensure that your Neo4j instance <a href='https://neo4j.com/docs/operations-manual/current/monitoring/metrics/expose/#metrics-csv'>exposes CSV metrics</a>. 
                    This is on by default in many versions of Neo4j.</li>
                    <li>Ensure that you have <a href='https://github.com/neo4j-contrib/neo4j-apoc-procedures/releases'>APOC installed</a>&nbsp;
                    <strong>and that it is a recent version</strong> higher than 3.5.01 for Neo4j 3.5, or 3.4.0.4 for Neo4j 3.4</li>
                    <li>Ensure that your {code('neo4j.conf')} includes {code('apoc.import.file.enabled=true')}, which
                    will permit access to the metrics.
                    </li>
                </ul>

            </Message.Content>
        </Message>            
    );
}

export default hoc.compatibilityCheckableComponent(
    StorageCapacity,
    compatCheckFn,
    notSupported);
