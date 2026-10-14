package nl.inl.corpuswebsite.response;

import java.io.IOException;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import nl.inl.corpuswebsite.BaseResponse;
import nl.inl.corpuswebsite.config.GlobalConfig;
import nl.inl.corpuswebsite.config.GlobalConfig.Keys;
import nl.inl.corpuswebsite.http.HttpResourceResponder;
import nl.inl.corpuswebsite.http.HttpResourceType;
import nl.inl.corpuswebsite.http.InMemoryHttpResource;

/** Return the global runtime configuration. */
public class ConfigResponse extends BaseResponse {
    public ConfigResponse() {
        super("config", false);
    }

    @Override
    protected void completeRequest() throws IOException {
        GlobalConfig globalConfig = servlet.getGlobalConfig();
        ObjectMapper mapper = new ObjectMapper();
        ObjectNode json = mapper.createObjectNode();
        json.put("BLS_URL", globalConfig.get(GlobalConfig.Keys.BLS_URL_ON_CLIENT));
        json.put("CF_URL", globalConfig.get(Keys.CF_URL_ON_CLIENT));
        json.put("commit_hash", GlobalConfig.commitHash);
        json.put("commit_time", GlobalConfig.commitTime);
        json.put("commit_message", GlobalConfig.commitMessage);
        json.put("version", GlobalConfig.version);
        json.put("branch", GlobalConfig.branch);

        InMemoryHttpResource resource = InMemoryHttpResource.fromString(mapper.writeValueAsString(json), HttpResourceType.API_PUBLIC, System.currentTimeMillis());
        HttpResourceResponder.serve(request, response, resource, "application/json; charset=utf-8");
    }
}
