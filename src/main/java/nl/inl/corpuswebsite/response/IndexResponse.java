package nl.inl.corpuswebsite.response;

import java.io.IOException;

import nl.inl.corpuswebsite.BaseResponse;
import nl.inl.corpuswebsite.http.HttpResourceResponder;
import nl.inl.corpuswebsite.http.HttpResourceType;
import nl.inl.corpuswebsite.http.InMemoryHttpResource;
import nl.inl.corpuswebsite.velocity.TemplateUtils;

public class IndexResponse extends BaseResponse {

    public IndexResponse() {
        super("main", false);
    }

    @Override
    protected void completeRequest() throws IOException {
        model.put("pageSize", servlet.getWebsiteConfig(corpus).getPageSize().map(Object::toString).orElse(Integer.toString(Integer.MAX_VALUE)));
        model.put("debugInfo", servlet.debugInfo());
        
        String rendered = TemplateUtils.renderTemplateToString(servlet.getTemplate("index"), model);
        InMemoryHttpResource resource = InMemoryHttpResource.fromString(rendered, HttpResourceType.ASSET, System.currentTimeMillis());
        HttpResourceResponder.serve(request, response, resource, "text/html; charset=utf-8");
    }
}
